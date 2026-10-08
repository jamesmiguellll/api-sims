import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  return handleAddToInventory(request, props);
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  return handleAddToInventory(request, props);
}

async function handleAddToInventory(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json().catch(() => ({}));
    const locationIdInput = body.locationId ? Number(body.locationId) : null;
    const notesInput = String(body.notes || "").trim();

    const batch = await prisma.productionBatches.findUnique({
      where: { BatchId: id },
      include: {
        FinishedProducts: { include: { Items: true } },
        InventoryLots: true,
        ProductionRequests: true,
      },
    });

    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    if (!["For Stock-in", "Passed QA", "Partial Pass", "Stocked In"].includes(batch.Status)) {
      return NextResponse.json(
        {
          success: false,
          message: `Batch cannot be committed to inventory from status "${batch.Status}". It must be cleared by QA first.`,
        },
        { status: 400 }
      );
    }

    // Get the latest QualityInspection for this batch to get accepted quantity
    const inspection = await prisma.qualityInspections.findFirst({
      where: { ReferenceId: id, ReferenceType: "ProductionBatch" },
      orderBy: { InspectionId: "desc" },
    });

    const acceptedQty = inspection
      ? Number(inspection.TotalAcceptedQuantity)
      : Number(batch.FinalQuantity || batch.ActualQuantity || batch.EstimatedQuantity || 0);

    if (acceptedQty <= 0) {
      return NextResponse.json(
        { success: false, message: "No accepted quantity to commit to inventory." },
        { status: 400 }
      );
    }

    // Find storage location
    const fgLocation = locationIdInput
      ? await prisma.locations.findUnique({ where: { LocationId: locationIdInput } })
      : await prisma.locations.findFirst({
          where: { IsActive: true },
          orderBy: { LocationId: "asc" },
        });

    if (!fgLocation) {
      return NextResponse.json(
        { success: false, message: "No active storage location found in the system." },
        { status: 400 }
      );
    }

    const itemId = batch.FinishedProducts?.ItemId || batch.ProductId;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      let activeLotId = batch.FgLotId;
      let finalLotCode = batch.InventoryLots?.LotCode;

      // 1. If FG lot was registered during packaging, update it to Available
      if (batch.FgLotId && batch.InventoryLots) {
        await tx.inventoryLots.update({
          where: { LotId: batch.FgLotId },
          data: {
            Status: "Available",
            QuantityRemaining: acceptedQty,
            HoldReason: null,
            LocationId: fgLocation.LocationId,
          },
        });
      } else {
        // Create new lot if not already created
        const year = now.getFullYear();
        const lotSeq = await tx.documentSequences.upsert({
          where: { DocType_Year: { DocType: "FGLot", Year: year } },
          update: { LastNumber: { increment: 1 } },
          create: { DocType: "FGLot", Year: year, LastNumber: 1 },
        });
        finalLotCode = `FG-${batch.BatchNumber}-${String(lotSeq.LastNumber).padStart(3, "0")}`;

        const createdLot = await tx.inventoryLots.create({
          data: {
            LotCode: finalLotCode,
            ItemId: itemId,
            LocationId: fgLocation.LocationId,
            SourceType: "Production",
            ProductionOrderId: id,
            ReceivedDate: now,
            ExpiryDate: batch.ExpiryDate,
            IsExpiryEstimated: false,
            QuantityReceived: acceptedQty,
            QuantityRemaining: acceptedQty,
            UomId: batch.FinishedProducts?.Items?.UomId || 1,
            UnitCost: Number(batch.UnitCost),
            Status: "Available",
            IsOpeningBalance: false,
          },
        });
        activeLotId = createdLot.LotId;
      }

      // 2. Update Inventories table (aggregate stock)
      const existingInventory = await tx.inventories.findFirst({
        where: { ItemId: itemId, LocationId: fgLocation.LocationId },
      });

      if (existingInventory) {
        await tx.inventories.update({
          where: { InventoryId: existingInventory.InventoryId },
          data: {
            CurrentStock: { increment: acceptedQty },
          },
        });
      } else {
        await tx.inventories.create({
          data: {
            ItemId: itemId,
            LocationId: fgLocation.LocationId,
            CurrentStock: acceptedQty,
          },
        });
      }

      // 3. Create StockLedgers audit entry
      if (activeLotId) {
        await tx.stockLedgers.create({
          data: {
            ItemId: itemId,
            LocationId: fgLocation.LocationId,
            LotId: activeLotId,
            MovementType: "IN",
            Quantity: acceptedQty,
            UomId: batch.FinishedProducts?.Items?.UomId || 1,
            UnitCost: Number(batch.UnitCost || 0),
            ReferenceType: "ProductionBatch",
            ReferenceId: String(id),
            UserId: "inventory-manager",
            UserName: "Inventory Manager",
            PostedAt: now,
            Notes: `Production batch committed to inventory. Lot: ${finalLotCode}${notesInput ? ` | Notes: ${notesInput}` : ""}`,
          },
        });
      }

      // 4. Update Batch status to Stocked In / Completed
      const activityLog = `[ACTIVITY:${now.toISOString()}|TITLE:Committed to inventory: ${acceptedQty} units added to ${fgLocation.LocationName}|ACTOR:Inventory Manager]`;
      const updatedNotes = batch.Notes ? `${batch.Notes}\n${activityLog}` : activityLog;

      const completedBatch = await tx.productionBatches.update({
        where: { BatchId: id },
        data: {
          Status: "Stocked In",
          CurrentStage: "Completed",
          Stage: "Completed",
          CompletedDate: now,
          FgLotId: activeLotId,
          Notes: updatedNotes,
        },
      });

      // 5. Update linked Production Request to Completed
      if (batch.ProdReqId) {
        await tx.productionRequests.update({
          where: { ProdReqId: batch.ProdReqId },
          data: {
            Status: "Completed",
            UpdatedAt: now,
          },
        });
      }

      return { completedBatch, finalLotCode, acceptedQty };
    });

    return NextResponse.json({
      success: true,
      message: `Batch successfully committed to inventory! ${result.acceptedQty} units added under lot ${result.finalLotCode}.`,
      data: {
        batchId: result.completedBatch.BatchId,
        status: result.completedBatch.Status,
        lotCode: result.finalLotCode,
        quantityAdded: result.acceptedQty,
        locationName: fgLocation.LocationName,
      },
    });
  } catch (error: any) {
    console.error("Stock-In API error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
