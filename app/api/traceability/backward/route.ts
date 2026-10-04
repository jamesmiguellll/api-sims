import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Backward traceability: given a batch ID or batch number, find the source lots used
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId") || "";

    if (!batchId) {
      return NextResponse.json({ success: false, message: "batchId query param is required." }, { status: 400 });
    }

    // Support both numeric ID and batch number string
    const numericId = parseInt(batchId, 10);
    const batch = await prisma.productionBatches.findFirst({
      where: isNaN(numericId)
        ? { BatchNumber: batchId }
        : { OR: [{ BatchId: numericId }, { BatchNumber: batchId }] },
      include: {
        FinishedProducts: { include: { Items: true } },
        Recipes: true,
        BatchConsumptions: {
          include: {
            Items: { include: { Category: true } },
            InventoryLots: {
              include: { Suppliers: true, Locations: true },
            },
            UnitOfMeasures: true,
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ success: false, message: `Batch "${batchId}" not found.` }, { status: 404 });
    }

    const data = {
      batchId: batch.BatchId,
      batchNumber: batch.BatchNumber,
      productName: batch.FinishedProducts?.Items?.ItemName ?? "",
      recipeName: batch.Recipes?.RecipeName ?? "",
      status: batch.Status,
      productionDate: batch.ProductionDate?.toISOString() ?? null,
      ingredients: batch.BatchConsumptions.map((bc) => ({
        consumptionId: bc.BatchConsumptionId,
        itemId: bc.ItemId,
        itemName: bc.Items?.ItemName ?? "",
        categoryName: bc.Items?.Category?.CategoryName ?? "",
        requiredQuantity: Number(bc.RequiredQuantity),
        quantityUsed: Number(bc.QuantityUsed),
        uomAbbr: bc.UnitOfMeasures?.Abbreviation ?? "",
        lotId: bc.LotId ?? null,
        lotCode: bc.InventoryLots?.LotCode ?? null,
        supplierName: bc.InventoryLots?.Suppliers?.CompanyName ?? "",
        locationName: bc.InventoryLots?.Locations?.LocationName ?? "",
        unitCost: Number(bc.UnitCost),
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("GET /api/traceability/backward error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
