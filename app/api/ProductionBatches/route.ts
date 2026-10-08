import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export function mapBatch(b: any) {
  const product = b.FinishedProducts;
  const recipe = b.Recipes;
  const itemName = product?.Items?.ItemName ?? "";
  const itemCode = product?.Items?.ItemCode ?? "";

  return {
    batchId: b.BatchId,
    batchNumber: b.BatchNumber,
    prodReqId: b.ProdReqId,
    reqNumber: b.ProductionRequests?.ReqNumber ?? "",
    productId: b.ProductId,
    productName: itemName,
    productCode: itemCode,
    variant: product?.Variant ?? "",
    sku: product?.Sku ?? "",
    recipeId: b.RecipeId,
    recipeName: recipe?.RecipeName ?? "",
    recipeCode: recipe?.RecipeCode ?? "",
    yieldUom: recipe?.UnitOfMeasures?.Abbreviation ?? "",
    batchMultiplier: Number(b.BatchMultiplier),
    estimatedQuantity: Number(b.EstimatedQuantity),
    actualQuantity: Number(b.ActualQuantity),
    finalQuantity: Number(b.FinalQuantity ?? 0),
    scrapQuantity: Number(b.ScrapQuantity),
    scrapReason: b.ScrapReason ?? "",
    productionDate: b.ProductionDate ? b.ProductionDate.toISOString() : null,
    startedAt: b.StartedAt ? b.StartedAt.toISOString() : null,
    completedDate: b.CompletedDate ? b.CompletedDate.toISOString() : null,
    packagedAt: b.PackagedAt ? b.PackagedAt.toISOString() : null,
    packagedBy: b.PackagedBy ?? "",
    expiryDate: b.ExpiryDate ? b.ExpiryDate.toISOString() : null,
    stage: b.CurrentStage || b.Stage,
    currentStage: b.CurrentStage || b.Stage,
    qualityStatus: b.QualityStatus,
    rejectionReason: b.RejectionReason ?? "",
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
  };
}

export const BATCH_INCLUDE = {
  FinishedProducts: {
    include: {
      Items: true,
    },
  },
  Recipes: {
    include: {
      UnitOfMeasures: true,
    },
  },
  InventoryLots: true,
  ProductionRequests: true,
  BatchConsumptions: {
    include: {
      Items: true,
      UnitOfMeasures: true,
      InventoryLots: true,
    },
  },
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "All";
    const stage = searchParams.get("stage") || "All";
    const search = searchParams.get("search")?.trim().toLowerCase() || "";

    const where: any = {};
    if (status !== "All") where.Status = status;
    if (stage !== "All") where.CurrentStage = stage;

    if (search) {
      where.OR = [
        { BatchNumber: { contains: search, mode: "insensitive" } },
        { AssignedCook: { contains: search, mode: "insensitive" } },
        { FinishedProducts: { Items: { ItemName: { contains: search, mode: "insensitive" } } } },
        { Recipes: { RecipeName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const batches = await prisma.productionBatches.findMany({
      where,
      include: BATCH_INCLUDE,
      orderBy: { BatchId: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: batches.map(mapBatch),
    });
  } catch (error: any) {
    console.error("GET /api/ProductionBatches error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prodReqId = Number(body.prodReqId);

    if (!prodReqId) {
      return NextResponse.json(
        { success: false, message: "Production Request ID (prodReqId) is required to start a batch." },
        { status: 400 }
      );
    }

    const prodReq = await prisma.productionRequests.findUnique({
      where: { ProdReqId: prodReqId },
      include: {
        FinishedProducts: {
          include: { Items: true },
        },
        Recipes: {
          include: {
            RecipeIngredients: {
              include: { Items: true, Uom: true },
            },
          },
        },
        ProductionReqLotReservations: {
          include: {
            InventoryLots: true,
          },
        },
      },
    });

    if (!prodReq) {
      return NextResponse.json({ success: false, message: "Production request not found." }, { status: 404 });
    }

    if (prodReq.Status !== "Materials Issued") {
      return NextResponse.json(
        { success: false, message: `Only requests with 'Materials Issued' status can be started. Current status: ${prodReq.Status}` },
        { status: 400 }
      );
    }

    // Determine product code for batch number
    const rawCode = prodReq.FinishedProducts?.Items?.ItemCode || prodReq.FinishedProducts?.Items?.ItemName || "PROD";
    const productCode = rawCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);

    const now = new Date();
    const year = now.getFullYear();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

    // Unique sequence per product code + year
    const docType = `Batch_${productCode}`;
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: docType, Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: docType, Year: year, LastNumber: 1 },
    });

    // Format: BTH-PRODUCTCODE-YYYYMMDD-XXXX
    const batchNumber = `BTH-${productCode}-${dateStr}-${String(seq.LastNumber).padStart(4, "0")}`;

    const multiplier = Number(prodReq.Recipes.OutputQuantity) > 0
      ? Number(prodReq.Quantity) / Number(prodReq.Recipes.OutputQuantity)
      : 1;

    // Build consumptions from reservations or recipe ingredients
    const consumptionsData: any[] = [];
    if (prodReq.ProductionReqLotReservations.length > 0) {
      for (const res of prodReq.ProductionReqLotReservations) {
        consumptionsData.push({
          ItemId: res.ItemId,
          RequiredQuantity: res.ReservedQuantity,
          QuantityUsed: res.ReservedQuantity,
          UomId: res.InventoryLots?.UomId ?? null,
          LotId: res.LotId,
          UnitCost: res.InventoryLots?.UnitCost ?? 0,
        });
      }
    } else {
      for (const ing of prodReq.Recipes.RecipeIngredients) {
        consumptionsData.push({
          ItemId: ing.ItemId,
          RequiredQuantity: Number(ing.StandardQuantity) * multiplier,
          QuantityUsed: Number(ing.StandardQuantity) * multiplier,
          UomId: ing.UomId,
          UnitCost: 0,
        });
      }
    }

    const createdBatch = await prisma.$transaction(async (tx) => {
      const batch = await tx.productionBatches.create({
        data: {
          ProdReqId: prodReq.ProdReqId,
          RecipeId: prodReq.RecipeId,
          ProductId: prodReq.ProductId,
          BatchMultiplier: multiplier,
          EstimatedQuantity: Number(prodReq.Quantity),
          ActualQuantity: 0,
          ProductionDate: now,
          StartedAt: now,
          Stage: "Pre-Production",
          CurrentStage: "Pre-Production",
          QualityStatus: "Pending",
          RejectionReason: "",
          ImageUrl: "",
          Notes: body.notes || prodReq.Reason || "",
          Purpose: "Production Request Fulfillment",
          AssignedCook: body.assignedCook || prodReq.RequestedBy || "Head Cook",
          Status: "In Production",
          BatchNumber: batchNumber,
          ScrapQuantity: 0,
          BatchConsumptions: {
            create: consumptionsData,
          },
        },
        include: BATCH_INCLUDE,
      });

      // Update ProductionRequests status
      await tx.productionRequests.update({
        where: { ProdReqId: prodReq.ProdReqId },
        data: {
          Status: "In Production",
          UpdatedAt: now,
        },
      });

      return batch;
    });

    return NextResponse.json({
      success: true,
      message: `Production Batch ${createdBatch.BatchNumber} created and started.`,
      data: mapBatch(createdBatch),
    });
  } catch (error: any) {
    console.error("POST /api/ProductionBatches error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
