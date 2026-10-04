import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const batch = await prisma.productionBatches.findUnique({
      where: { BatchId: id },
      include: { FinishedProducts: { include: { Items: true } } },
    });

    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    if (!["Passed QA", "In Progress"].includes(batch.Status)) {
      return NextResponse.json(
        { success: false, message: `Batch cannot be stocked in from status "${batch.Status}". It must have Passed QA.` },
        { status: 400 }
      );
    }

    const actualQty = Number(batch.ActualQuantity);
    if (actualQty <= 0) {
      return NextResponse.json(
        { success: false, message: "Batch has no actual quantity to stock in. Complete the Packaging step first." },
        { status: 400 }
      );
    }

    // Find default finished goods storage location (first active system location)
    const fgLocation = await prisma.locations.findFirst({
      where: { IsActive: true },
      orderBy: { LocationId: "asc" },
    });

    if (!fgLocation) {
      return NextResponse.json({ success: false, message: "No active storage location found in the system." }, { status: 400 });
    }

    const itemId = batch.FinishedProducts?.ItemId;
    if (!itemId) {
      return NextResponse.json({ success: false, message: "Finished product has no linked item record." }, { status: 400 });
    }

    // Generate FG lot code
    const year = new Date().getFullYear();
    const lotSeq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "FGLot", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "FGLot", Year: year, LastNumber: 1 },
    });
    const lotCode = `FG-${batch.BatchNumber}-${String(lotSeq.LastNumber).padStart(3, "0")}`;

    // Get stock UOM for this item
    const item = await prisma.items.findUnique({
      where: { ItemId: itemId },
      include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true },
    });
    const uomId = item?.StockUomId ?? 1;

    // Create inventory lot
    const newLot = await prisma.inventoryLots.create({
      data: {
        LotCode: lotCode,
        ItemId: itemId,
        LocationId: fgLocation.LocationId,
        SourceType: "Production",
        ProductionOrderId: id,
        ReceivedDate: new Date(),
        IsExpiryEstimated: false,
        QuantityReceived: actualQty,
        QuantityRemaining: actualQty,
        UomId: uomId,
        UnitCost: Number(batch.UnitCost),
        Status: "Available",
        IsOpeningBalance: false,
      },
    });

    // Mark batch as Completed and link FG lot
    const completed = await prisma.productionBatches.update({
      where: { BatchId: id },
      data: {
        Status: "Inventory Added",
        Stage: "Completed",
        CompletedDate: new Date(),
        FgLotId: newLot.LotId,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Batch stocked into inventory. FG Lot: ${lotCode}`,
      data: {
        batchId: completed.BatchId,
        status: completed.Status,
        fgLotId: newLot.LotId,
        lotCode,
        quantityAdded: actualQty,
        locationId: fgLocation.LocationId,
        locationName: fgLocation.LocationName,
      },
    });
  } catch (error: any) {
    console.error("PUT /api/ProductionBatches/[id]/add-to-inventory error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
