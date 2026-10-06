import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BATCH_INCLUDE, mapBatch } from "../../route";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const finalQuantity = Number(body.finalQuantity);
    const packagedBy = body.packagedBy || "Head Cook";
    const expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
    const scrapQuantity = Number(body.scrapQuantity) || 0;
    const scrapReason = body.scrapReason || "";
    const notes = body.notes || "";

    if (!finalQuantity || finalQuantity <= 0) {
      return NextResponse.json({ success: false, message: "Final output quantity must be greater than 0." }, { status: 400 });
    }

    const batch = await prisma.productionBatches.findUnique({
      where: { BatchId: id },
      include: {
        FinishedProducts: {
          include: { Items: true },
        },
        ProductionRequests: true,
      },
    });

    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    if (batch.Status === "Completed") {
      return NextResponse.json({ success: false, message: "Batch has already been completed." }, { status: 400 });
    }

    // Determine FG location: look for LocationType === 'Finished Goods' or fallback to LocationId 4 or 1
    const fgLocation = await prisma.locations.findFirst({
      where: { LocationType: { contains: "Finished Goods", mode: "insensitive" } },
    });
    const fgLocationId = fgLocation?.LocationId ?? 4;

    const itemId = batch.FinishedProducts.ItemId;
    const uomId = batch.FinishedProducts.Items.UomId;
    const unitCost = Number(batch.UnitCost) || 0;
    const fgLotCode = `FG-${batch.BatchNumber}`;

    const now = new Date();

    const completedResult = await prisma.$transaction(async (tx) => {
      // 1. Create FG InventoryLot
      const fgLot = await tx.inventoryLots.create({
        data: {
          LotCode: fgLotCode,
          ItemId: itemId,
          LocationId: fgLocationId,
          SourceType: "Production",
          ProductionOrderId: batch.BatchId,
          ReceivedDate: now,
          ManufactureDate: now,
          ExpiryDate: expiryDate,
          IsExpiryEstimated: false,
          QuantityReceived: finalQuantity,
          QuantityRemaining: finalQuantity,
          ReservedQuantity: 0,
          UomId: uomId,
          UnitCost: unitCost,
          Status: "Active",
          IsOpeningBalance: false,
        },
      });

      // 2. Increment CurrentStock on Inventories
      await tx.inventories.upsert({
        where: {
          ItemId_LocationId: {
            ItemId: itemId,
            LocationId: fgLocationId,
          },
        },
        update: {
          CurrentStock: { increment: finalQuantity },
        },
        create: {
          ItemId: itemId,
          LocationId: fgLocationId,
          CurrentStock: finalQuantity,
        },
      });

      // 3. Post StockLedgers entry
      await tx.stockLedgers.create({
        data: {
          LotId: fgLot.LotId,
          ItemId: itemId,
          LocationId: fgLocationId,
          MovementType: "PRODUCTION_FG_STOCKIN",
          Quantity: finalQuantity,
          UomId: uomId,
          UnitCost: unitCost,
          ReferenceType: "ProductionBatch",
          ReferenceId: batch.BatchNumber,
          UserId: packagedBy,
          UserName: packagedBy,
          PostedAt: now,
          Notes: `Finished goods stock-in from completed Batch ${batch.BatchNumber}`,
        },
      });

      // 4. Update Batch
      const updatedBatch = await tx.productionBatches.update({
        where: { BatchId: id },
        data: {
          Status: "Completed",
          Stage: "Completed",
          CurrentStage: "Completed",
          CompletedDate: now,
          ActualQuantity: finalQuantity,
          FgLotId: fgLot.LotId,
          PackagedBy: packagedBy,
          PackagedAt: now,
          ExpiryDate: expiryDate,
          ScrapQuantity: scrapQuantity,
          ScrapReason: scrapReason,
          Notes: notes ? (batch.Notes ? `${batch.Notes}\n[Completion] ${notes}` : notes) : batch.Notes,
        },
        include: BATCH_INCLUDE,
      });

      // 5. Update linked ProductionRequest if exists
      if (batch.ProdReqId) {
        await tx.productionRequests.update({
          where: { ProdReqId: batch.ProdReqId },
          data: {
            Status: "Completed",
            UpdatedAt: now,
          },
        });
      }

      return { batch: updatedBatch, fgLot };
    });

    return NextResponse.json({
      success: true,
      message: `Production Batch ${batch.BatchNumber} completed successfully. Finished Goods lot ${fgLotCode} created with ${finalQuantity} units.`,
      data: {
        batch: mapBatch(completedResult.batch),
        fgLot: {
          lotId: completedResult.fgLot.LotId,
          lotCode: completedResult.fgLot.LotCode,
          quantity: Number(completedResult.fgLot.QuantityReceived),
          expiryDate: completedResult.fgLot.ExpiryDate ? completedResult.fgLot.ExpiryDate.toISOString() : null,
        },
      },
    });
  } catch (error: any) {
    console.error("POST /api/ProductionBatches/[id]/complete error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
