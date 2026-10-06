import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export function mapProductionRequest(r: any) {
  const product = r.FinishedProducts;
  const recipe = r.Recipes;
  const itemName = product?.Items?.ItemName ?? "";
  const itemCode = product?.Items?.ItemCode ?? "";

  return {
    prodReqId: r.ProdReqId,
    reqNumber: r.ReqNumber,
    productId: r.ProductId,
    productName: itemName,
    productCode: itemCode,
    sku: product?.Sku ?? "",
    variant: product?.Variant ?? "",
    recipeId: r.RecipeId,
    recipeName: recipe?.RecipeName ?? "",
    recipeCode: recipe?.RecipeCode ?? "",
    recipeOutputQty: Number(recipe?.OutputQuantity ?? 0),
    yieldUom: recipe?.UnitOfMeasures?.Abbreviation ?? "",
    quantity: Number(r.Quantity),
    reason: r.Reason ?? "",
    priority: r.Priority ?? "Normal",
    requiredDate: r.RequiredDate ? r.RequiredDate.toISOString() : null,
    requiredTime: r.RequiredTime ?? "",
    requestedBy: r.RequestedBy ?? "",
    status: r.Status ?? "Draft",
    linkedPrId: r.LinkedPrId,
    linkedPrNumber: r.PurchaseRequisitions?.PrNumber ?? null,
    adminNotes: r.AdminNotes ?? "",
    approvedBy: r.ApprovedBy ?? "",
    approvedAt: r.ApprovedAt ? r.ApprovedAt.toISOString() : null,
    rejectedBy: r.RejectedBy ?? "",
    rejectedAt: r.RejectedAt ? r.RejectedAt.toISOString() : null,
    rejectionReason: r.RejectionReason ?? "",
    createdAt: r.CreatedAt ? r.CreatedAt.toISOString() : null,
    updatedAt: r.UpdatedAt ? r.UpdatedAt.toISOString() : null,
    recipeIngredients: (recipe?.RecipeIngredients ?? []).map((ing: any) => ({
      ingredientId: ing.IngredientId,
      itemId: ing.ItemId,
      itemName: ing.Items?.ItemName ?? "",
      itemCode: ing.Items?.ItemCode ?? "",
      standardQuantity: Number(ing.StandardQuantity),
      uomId: ing.UomId,
      uomAbbr: ing.Uom?.Abbreviation ?? ing.Items?.Uom?.Abbreviation ?? "",
    })),
    reservations: (r.ProductionReqLotReservations ?? []).map((res: any) => ({
      reservationId: res.ReservationId,
      ingredientId: res.IngredientId,
      itemId: res.ItemId,
      itemName: res.Items?.ItemName ?? "",
      lotId: res.LotId,
      lotCode: res.InventoryLots?.LotCode ?? "",
      reservedQuantity: Number(res.ReservedQuantity),
      isReleased: res.IsReleased,
      releasedAt: res.ReleasedAt ? res.ReleasedAt.toISOString() : null,
      expiryDate: res.InventoryLots?.ExpiryDate ? res.InventoryLots.ExpiryDate.toISOString() : null,
      quantityRemaining: Number(res.InventoryLots?.QuantityRemaining ?? 0),
    })),
    issuances: (r.MaterialIssuances ?? []).map((iss: any) => ({
      issuanceId: iss.IssuanceId,
      issuanceNumber: iss.IssuanceNumber,
      issuedBy: iss.IssuedBy,
      issuedAt: iss.IssuedAt ? iss.IssuedAt.toISOString() : null,
      status: iss.Status,
      scans: (iss.MaterialIssuanceScans ?? []).map((s: any) => ({
        scanId: s.ScanId,
        ingredientId: s.IngredientId,
        itemId: s.ItemId,
        lotId: s.LotId,
        lotCode: s.LotCode,
        scannedAt: s.ScannedAt ? s.ScannedAt.toISOString() : null,
        scannedBy: s.ScannedBy,
        isVerified: s.IsVerified,
      })),
    })),
    batches: (r.ProductionBatches ?? []).map((b: any) => ({
      batchId: b.BatchId,
      batchNumber: b.BatchNumber,
      status: b.Status,
      stage: b.CurrentStage || b.Stage,
      currentStage: b.CurrentStage || b.Stage,
      estimatedQuantity: Number(b.EstimatedQuantity),
      actualQuantity: Number(b.ActualQuantity),
      productionDate: b.ProductionDate ? b.ProductionDate.toISOString() : null,
      startedAt: b.StartedAt ? b.StartedAt.toISOString() : null,
      completedDate: b.CompletedDate ? b.CompletedDate.toISOString() : null,
    })),
  };
}

export const PROD_REQ_INCLUDE = {
  FinishedProducts: {
    include: {
      Items: true,
    },
  },
  Recipes: {
    include: {
      UnitOfMeasures: true,
      RecipeIngredients: {
        include: {
          Items: {
            include: {
              Uom: true,
            },
          },
          Uom: true,
        },
      },
    },
  },
  PurchaseRequisitions: true,
  ProductionReqLotReservations: {
    include: {
      InventoryLots: true,
      Items: true,
    },
  },
  MaterialIssuances: {
    include: {
      MaterialIssuanceScans: true,
    },
  },
  ProductionBatches: true,
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "All";
    const priority = searchParams.get("priority") || "All";
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const role = searchParams.get("role")?.toLowerCase() || "";

    const where: any = {};

    // Role-based visibility
    if (role === "head_cook") {
      where.Status = { in: ["Materials Issued", "In Production", "Completed"] };
    }

    if (status !== "All") {
      if (status === "Ready for Production") {
        where.Status = { in: ["Materials Issued", "Ready for Production"] };
      } else if (status === "In Progress") {
        where.Status = { in: ["In Production", "In Progress"] };
      } else {
        where.Status = status;
      }
    }

    if (priority !== "All") {
      if (priority === "High") {
        where.Priority = { in: ["High", "Priority"] };
      } else if (priority === "Medium") {
        where.Priority = { in: ["Medium", "Normal"] };
      } else if (priority === "Low") {
        where.Priority = "Low";
      } else {
        where.Priority = priority;
      }
    }

    if (search) {
      where.OR = [
        { ReqNumber: { contains: search, mode: "insensitive" } },
        { RequestedBy: { contains: search, mode: "insensitive" } },
        { FinishedProducts: { Items: { ItemName: { contains: search, mode: "insensitive" } } } },
        { Recipes: { RecipeName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const requests = await prisma.productionRequests.findMany({
      where,
      include: PROD_REQ_INCLUDE,
      orderBy: [
        { Priority: "desc" }, // 'Priority' precedes 'Normal' alphabetically in DESC order
        { ProdReqId: "desc" },
      ],
    });

    return NextResponse.json({
      success: true,
      data: requests.map(mapProductionRequest),
    });
  } catch (error: any) {
    console.error("GET /api/production-requests error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch production requests." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const productId = Number(body.productId);
    const recipeId = Number(body.recipeId);
    const quantity = Number(body.quantity);

    if (!productId || !recipeId || !quantity || quantity <= 0) {
      return NextResponse.json(
        { success: false, message: "Valid Product, Recipe, and positive Quantity are required." },
        { status: 400 }
      );
    }

    // Verify recipe and get output quantity and ingredients
    const recipe = await prisma.recipes.findUnique({
      where: { RecipeId: recipeId },
      include: {
        RecipeIngredients: {
          include: {
            Items: true,
            Uom: true,
          },
        },
      },
    });

    if (!recipe) {
      return NextResponse.json({ success: false, message: "Recipe not found." }, { status: 404 });
    }

    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "ProdReq", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "ProdReq", Year: year, LastNumber: 1 },
    });
    const reqNumber = `PRQ-${year}-${String(seq.LastNumber).padStart(4, "0")}`;

    const initialStatus = "Pending Approval";

    const multiplier = Number(recipe.OutputQuantity) > 0 ? quantity / Number(recipe.OutputQuantity) : 1;

    const rawPriority = body.priority || "Medium";
    const mappedPriority = ["Low", "Medium", "High"].includes(rawPriority)
      ? rawPriority
      : rawPriority === "Priority"
      ? "High"
      : "Medium";

    // Use transaction to create request and allocate FIFO/FEFO lot reservations
    const createdRequest = await prisma.$transaction(async (tx) => {
      const prodReq = await tx.productionRequests.create({
        data: {
          ReqNumber: reqNumber,
          ProductId: productId,
          RecipeId: recipeId,
          Quantity: quantity,
          Reason: body.reason || "",
          Priority: mappedPriority,
          RequiredDate: body.requiredDate ? new Date(body.requiredDate) : new Date(Date.now() + 86400000),
          RequiredTime: body.requiredTime || "",
          RequestedBy: body.requestedBy || "Inventory Manager",
          Status: initialStatus,
          AdminNotes: body.notes || "",
        },
      });

      // Allocate lot reservations per ingredient using FIFO/FEFO
      for (const ing of recipe.RecipeIngredients) {
        const requiredQty = Number(ing.StandardQuantity) * multiplier;
        let stillNeeded = requiredQty;

        // Query available lots
        const lots = await tx.inventoryLots.findMany({
          where: {
            ItemId: ing.ItemId,
            Status: { in: ["Available", "Active"] },
            QuantityRemaining: { gt: 0 },
          },
          orderBy: [
            { ExpiryDate: "asc" },
            { ReceivedDate: "asc" },
          ],
        });

        for (const lot of lots) {
          if (stillNeeded <= 0) break;
          const availableInLot = Math.max(0, Number(lot.QuantityRemaining) - Number(lot.ReservedQuantity || 0));
          if (availableInLot <= 0) continue;

          const toReserve = Math.min(stillNeeded, availableInLot);

          await tx.productionReqLotReservations.create({
            data: {
              ProdReqId: prodReq.ProdReqId,
              IngredientId: ing.IngredientId,
              ItemId: ing.ItemId,
              LotId: lot.LotId,
              ReservedQuantity: toReserve,
              IsReleased: false,
            },
          });

          await tx.inventoryLots.update({
            where: { LotId: lot.LotId },
            data: {
              ReservedQuantity: { increment: toReserve },
            },
          });

          stillNeeded -= toReserve;
        }
      }

      // If submitted for approval, create ApprovalRequests entry
      if (initialStatus === "Pending Approval") {
        await tx.approvalRequests.create({
          data: {
            EntityType: "ProductionRequest",
            EntityId: prodReq.ProdReqId,
            DocumentNumber: prodReq.ReqNumber,
            Amount: 0,
            Status: "Pending",
            Reason: prodReq.Reason || "Production Request Approval",
            RequestedBy: prodReq.RequestedBy,
            RequestedAt: new Date(),
          },
        });
      }

      return prodReq;
    });

    const fullProdReq = await prisma.productionRequests.findUnique({
      where: { ProdReqId: createdRequest.ProdReqId },
      include: PROD_REQ_INCLUDE,
    });

    return NextResponse.json({
      success: true,
      message: "Production request created successfully.",
      data: mapProductionRequest(fullProdReq),
    });
  } catch (error: any) {
    console.error("POST /api/production-requests error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create production request." },
      { status: 500 }
    );
  }
}
