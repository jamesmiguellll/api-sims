import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BATCH_INCLUDE = {
  FinishedProducts: {
    include: { Items: true },
  },
  Recipes: {
    include: { UnitOfMeasures: true },
  },
  ProductionRequests: {
    include: {
      ProductionReqLotReservations: {
        include: {
          InventoryLots: true,
          Items: true,
        },
      },
    },
  },
  InventoryLots: true,
  BatchConsumptions: {
    include: {
      Items: true,
      UnitOfMeasures: true,
      InventoryLots: true,
    },
  },
};

function mapBatch(b: any) {
  const product = b.FinishedProducts;
  const recipe = b.Recipes;
  const prodReq = b.ProductionRequests;
  return {
    batchId: b.BatchId,
    batchNumber: b.BatchNumber,
    prodReqId: b.ProdReqId,
    reqNumber: prodReq?.ReqNumber ?? "",
    requestedBy: prodReq?.RequestedBy ?? "",
    approvedBy: prodReq?.ApprovedBy ?? "",
    requestedQty: Number(prodReq?.Quantity ?? b.EstimatedQuantity),
    productId: b.ProductId,
    productName: product?.Items?.ItemName ?? "",
    productCode: product?.Items?.ItemCode ?? "",
    variant: product?.Variant ?? "",
    sku: product?.Sku ?? "",
    recipeId: b.RecipeId,
    recipeName: recipe?.RecipeName ?? "",
    yieldUom: recipe?.UnitOfMeasures?.Abbreviation ?? "units",
    batchMultiplier: Number(b.BatchMultiplier),
    estimatedQuantity: Number(b.EstimatedQuantity),
    actualQuantity: Number(b.ActualQuantity),
    finalQuantity: Number(b.FinalQuantity ?? 0),
    scrapQuantity: Number(b.ScrapQuantity),
    scrapReason: b.ScrapReason ?? "",
    productionDate: b.ProductionDate?.toISOString() ?? null,
    startedAt: b.StartedAt?.toISOString() ?? null,
    completedDate: b.CompletedDate?.toISOString() ?? null,
    packagedAt: b.PackagedAt?.toISOString() ?? null,
    packagedBy: b.PackagedBy ?? "",
    expiryDate: b.ExpiryDate?.toISOString() ?? null,
    stage: b.CurrentStage || b.Stage,
    currentStage: b.CurrentStage || b.Stage,
    qualityStatus: b.QualityStatus,
    rejectionReason: b.RejectionReason ?? "",
    imageUrl: b.ImageUrl ?? "",
    notes: b.Notes ?? "",
    purpose: b.Purpose,
    status: b.Status,
    assignedCook: b.AssignedCook,
    fgLotId: b.FgLotId ?? null,
    fgLotCode: b.InventoryLots?.LotCode ?? "",
    totalMaterialCost: Number(b.TotalMaterialCost),
    unitCost: Number(b.UnitCost),
    yieldPercentage: Number(b.YieldPercentage),
    consumptions: (b.BatchConsumptions ?? []).map((c: any) => ({
      consumptionId: c.BatchConsumptionId,
      itemId: c.ItemId,
      itemName: c.Items?.ItemName ?? "",
      requiredQuantity: Number(c.RequiredQuantity),
      quantityUsed: Number(c.QuantityUsed),
      uomId: c.UomId,
      uomAbbr: c.UnitOfMeasures?.Abbreviation ?? "",
      lotId: c.LotId ?? null,
      lotCode: c.InventoryLots?.LotCode ?? "",
      unitCost: Number(c.UnitCost),
    })),
    reservations: (prodReq?.ProductionReqLotReservations ?? []).map((res: any) => ({
      reservationId: res.ReservationId,
      ingredientId: res.IngredientId,
      itemId: res.ItemId,
      itemName: res.Items?.ItemName ?? "",
      lotId: res.LotId,
      lotCode: res.InventoryLots?.LotCode ?? "",
      reservedQuantity: Number(res.ReservedQuantity),
    })),
  };
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const batch = await prisma.productionBatches.findUnique({
      where: { BatchId: id },
      include: BATCH_INCLUDE,
    });
    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: mapBatch(batch) });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const updated = await prisma.productionBatches.update({
      where: { BatchId: id },
      data: {
        ...(body.notes !== undefined && { Notes: body.notes }),
        ...(body.purpose !== undefined && { Purpose: body.purpose }),
        ...(body.assignedCook !== undefined && { AssignedCook: body.assignedCook }),
        ...(body.scheduleDate !== undefined && { ProductionDate: new Date(body.scheduleDate) }),
      },
      include: BATCH_INCLUDE,
    });

    return NextResponse.json({ success: true, data: mapBatch(updated) });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const batch = await prisma.productionBatches.findUnique({ where: { BatchId: id } });
    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }
    if (!["Draft", "Pending Approval", "Rejected"].includes(batch.Status)) {
      return NextResponse.json(
        { success: false, message: "Only Draft, Pending Approval, or Rejected batches can be deleted." },
        { status: 400 }
      );
    }
    await prisma.productionBatches.delete({ where: { BatchId: id } });
    return NextResponse.json({ success: true, message: "Batch deleted." });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
