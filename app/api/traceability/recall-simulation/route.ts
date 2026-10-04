import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Simulate recall impact: given a lot code, find all affected batches and downstream products
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lotCode = searchParams.get("lotCode") || "";

    if (!lotCode) {
      return NextResponse.json({ success: false, message: "lotCode is required." }, { status: 400 });
    }

    const lot = await prisma.inventoryLots.findFirst({
      where: { LotCode: lotCode },
      include: {
        Items: true,
        Suppliers: true,
        BatchConsumptions: {
          include: {
            ProductionBatches: {
              include: { FinishedProducts: { include: { Items: true } } },
            },
          },
        },
      },
    });

    if (!lot) {
      return NextResponse.json({ success: false, message: `Lot "${lotCode}" not found.` }, { status: 404 });
    }

    const affectedBatches = lot.BatchConsumptions.map((bc) => ({
      batchId: bc.BatchId,
      batchNumber: bc.ProductionBatches?.BatchNumber ?? "",
      productName: bc.ProductionBatches?.FinishedProducts?.Items?.ItemName ?? "",
      batchStatus: bc.ProductionBatches?.Status ?? "",
      quantityUsed: Number(bc.QuantityUsed),
    }));

    return NextResponse.json({
      success: true,
      data: {
        lotCode,
        itemName: lot.Items?.ItemName ?? "",
        supplierName: lot.Suppliers?.CompanyName ?? "",
        quantityReceived: Number(lot.QuantityReceived),
        quantityRemaining: Number(lot.QuantityRemaining),
        currentStatus: lot.Status,
        affectedBatchCount: affectedBatches.length,
        affectedBatches,
        estimatedRecallScope: `${affectedBatches.length} batch(es) affected`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
