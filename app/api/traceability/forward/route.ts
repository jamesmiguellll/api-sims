import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Forward traceability: given a lot code, find where ingredients went (which batches used it)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lotCode = searchParams.get("lotCode") || "";

    if (!lotCode) {
      return NextResponse.json({ success: false, message: "lotCode query param is required." }, { status: 400 });
    }

    const lot = await prisma.inventoryLots.findFirst({
      where: { LotCode: lotCode },
      include: {
        Items: { include: { Category: true } },
        Suppliers: true,
        Locations: true,
        GoodsReceiptItems: {
          include: { GoodsReceipts: true },
        },
        BatchConsumptions: {
          include: {
            ProductionBatches: {
              include: {
                FinishedProducts: { include: { Items: true } },
                Recipes: true,
              },
            },
          },
        },
      },
    });

    if (!lot) {
      return NextResponse.json({ success: false, message: `Lot code "${lotCode}" not found.` }, { status: 404 });
    }

    const data = {
      lotCode: lot.LotCode,
      itemId: lot.ItemId,
      itemName: lot.Items?.ItemName ?? "",
      categoryName: lot.Items?.Category?.CategoryName ?? "",
      supplierId: lot.SupplierId ?? null,
      supplierName: lot.Suppliers?.CompanyName ?? "",
      locationName: lot.Locations?.LocationName ?? "",
      receivedDate: lot.ReceivedDate.toISOString(),
      expiryDate: lot.ExpiryDate?.toISOString().split("T")[0] ?? null,
      quantityReceived: Number(lot.QuantityReceived),
      quantityRemaining: Number(lot.QuantityRemaining),
      status: lot.Status,
      grnNumber: lot.GoodsReceiptItems?.[0]?.GoodsReceipts?.GrnNumber ?? null,
      usedInBatches: lot.BatchConsumptions.map((bc) => ({
        batchId: bc.BatchId,
        batchNumber: bc.ProductionBatches?.BatchNumber ?? "",
        productName: bc.ProductionBatches?.FinishedProducts?.Items?.ItemName ?? "",
        recipeName: bc.ProductionBatches?.Recipes?.RecipeName ?? "",
        quantityUsed: Number(bc.QuantityUsed),
        status: bc.ProductionBatches?.Status ?? "",
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("GET /api/traceability/forward error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
