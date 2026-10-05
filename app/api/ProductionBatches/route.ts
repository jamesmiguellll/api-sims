import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Helper: shape a batch row into the frontend DTO ──────────────────────────
function mapBatch(b: any) {
  const product = b.FinishedProducts;
  const recipe = b.Recipes;
  const itemName = product?.Items?.ItemName ?? "";
  return {
    batchId: b.BatchId,
    batchNumber: b.BatchNumber,
    productId: b.ProductId,
    productName: itemName,
    variant: product?.Variant ?? "",
    sku: product?.Sku ?? "",
    recipeId: b.RecipeId,
    recipeName: recipe?.RecipeName ?? "",
    batchMultiplier: Number(b.BatchMultiplier),
    estimatedQuantity: Number(b.EstimatedQuantity),
    actualQuantity: Number(b.ActualQuantity),
    scrapQuantity: Number(b.ScrapQuantity),
    scrapReason: b.ScrapReason ?? "",
    productionDate: b.ProductionDate?.toISOString() ?? null,
    completedDate: b.CompletedDate?.toISOString() ?? null,
    stage: b.Stage,
    qualityStatus: b.QualityStatus,
    rejectionReason: b.RejectionReason ?? "",
    notes: b.Notes ?? "",
    purpose: b.Purpose,
    status: b.Status,
    assignedCook: b.AssignedCook,
    fgLotId: b.FgLotId ?? null,
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
      unitCost: Number(c.UnitCost),
    })),
  };
}

const BATCH_INCLUDE = {
  FinishedProducts: {
    include: {
      Items: true,
    },
  },
  Recipes: true,
  BatchConsumptions: {
    include: {
      Items: true,
      UnitOfMeasures: true,
    },
  },
};

export async function GET() {
  try {
    const batches = await prisma.productionBatches.findMany({
      include: BATCH_INCLUDE,
      orderBy: { BatchId: "desc" },
    });
    return NextResponse.json(batches.map(mapBatch));
  } catch (error: any) {
    console.error("GET /api/ProductionBatches error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate recipe & product exist
    const recipe = await prisma.recipes.findUnique({
      where: { RecipeId: body.recipeId },
      include: {
        RecipeIngredients: {
          include: { Items: true, Uom: true },
        },
      },
    });
    if (!recipe) {
      return NextResponse.json({ success: false, message: "Recipe not found." }, { status: 404 });
    }

    const multiplier = Number(body.batchMultiplier) || 1;
    const estimatedQty = Number(recipe.OutputQuantity) * multiplier;

    // Generate batch number
    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "Batch", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "Batch", Year: year, LastNumber: 1 },
    });
    const batchNumber = `BATCH-${year}-${String(seq.LastNumber).padStart(4, "0")}`;

    const status = body.status || "Pending Approval";

    const newBatch = await prisma.productionBatches.create({
      data: {
        RecipeId: body.recipeId,
        ProductId: body.productId,
        BatchMultiplier: multiplier,
        EstimatedQuantity: estimatedQty,
        ActualQuantity: 0,
        ProductionDate: body.scheduleDate ? new Date(body.scheduleDate) : new Date(),
        Stage: "Pre-Production",
        QualityStatus: "Pending",
        RejectionReason: "",
        ImageUrl: "",
        Notes: body.notes || "",
        Purpose: body.purpose || "Inventory Replenishment",
        AssignedCook: body.assignedCook || "",
        Status: status,
        BatchNumber: batchNumber,
        ScrapQuantity: 0,
        // Pre-populate BatchConsumptions from recipe ingredients
        BatchConsumptions: {
          create: recipe.RecipeIngredients.map((ing: any) => ({
            ItemId: ing.ItemId,
            RequiredQuantity: Number(ing.StandardQuantity) * multiplier,
            QuantityUsed: 0,
            UomId: ing.UomId,
            UnitCost: 0,
          })),
        },
      },
      include: BATCH_INCLUDE,
    });

    return NextResponse.json({ success: true, message: "Production batch created.", data: mapBatch(newBatch) });
  } catch (error: any) {
    console.error("POST /api/ProductionBatches error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
