import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Valid stage progression
const STAGE_TO_STATUS: Record<string, string> = {
  "Preparation": "In Progress",
  "Peeling": "In Progress",
  "Steaming": "In Progress",
  "Mixing": "In Progress",
  "Grind": "In Progress",
  "Mixing and Processing": "In Progress",
  "Cooking": "In Progress",
  "Cooling": "In Progress",
  "Quality Control": "In Progress",
  "Packaging": "In Progress",
};

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();
    const stage = body.stage as string;

    if (!stage) {
      return NextResponse.json({ success: false, message: "stage is required." }, { status: 400 });
    }

    const batch = await prisma.productionBatches.findUnique({ where: { BatchId: id } });
    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    const newStatus = STAGE_TO_STATUS[stage] ?? batch.Status;

    const updateData: any = {
      Stage: stage,
      Status: newStatus,
    };

    // If actual quantity is provided (packaging step)
    if (body.actualQuantity !== undefined) {
      const goodQty = Number(body.actualQuantity);
      const estimatedQty = Number(batch.EstimatedQuantity);
      updateData.ActualQuantity = goodQty;
      updateData.ScrapQuantity = Math.max(0, estimatedQty - goodQty);
      if (estimatedQty > 0) {
        updateData.YieldPercentage = (goodQty / estimatedQty) * 100;
      }
    }

    // If stage is Preparation — run FEFO deduction on BatchConsumptions
    if (stage === "Preparation") {
      const consumptions = await prisma.batchConsumptions.findMany({
        where: { BatchId: id },
        include: { Items: true },
      });

      for (const consumption of consumptions) {
        const required = Number(consumption.RequiredQuantity);
        let remaining = required;

        // FEFO: order lots by expiry ascending, then by lot id
        const lots = await prisma.inventoryLots.findMany({
          where: {
            ItemId: consumption.ItemId,
            Status: "Available",
            QuantityRemaining: { gt: 0 },
          },
          orderBy: [
            { ExpiryDate: "asc" },
            { LotId: "asc" },
          ],
        });

        for (const lot of lots) {
          if (remaining <= 0) break;
          const take = Math.min(Number(lot.QuantityRemaining), remaining);
          remaining -= take;

          await prisma.inventoryLots.update({
            where: { LotId: lot.LotId },
            data: {
              QuantityRemaining: { decrement: take },
              Status: Number(lot.QuantityRemaining) - take <= 0 ? "Depleted" : "Available",
            },
          });

          await prisma.batchConsumptions.update({
            where: { BatchConsumptionId: consumption.BatchConsumptionId },
            data: {
              QuantityUsed: take,
              LotId: lot.LotId,
              UnitCost: lot.UnitCost,
            },
          });
        }
      }

      // Calculate total material cost
      const updatedConsumptions = await prisma.batchConsumptions.findMany({ where: { BatchId: id } });
      const totalCost = updatedConsumptions.reduce<number>((sum, c) => sum + Number(c.UnitCost) * Number(c.QuantityUsed), 0);
      updateData.TotalMaterialCost = totalCost;
      const estimatedQty = Number(batch.EstimatedQuantity);
      updateData.UnitCost = estimatedQty > 0 ? totalCost / estimatedQty : 0;
    }

    const updated = await prisma.productionBatches.update({
      where: { BatchId: id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: `Batch stage updated to "${stage}".`,
      data: { batchId: updated.BatchId, stage: updated.Stage, status: updated.Status },
    });
  } catch (error: any) {
    console.error("PUT /api/ProductionBatches/[id]/stage error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
