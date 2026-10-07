import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const paramId = params.id;
  const { searchParams } = new URL(request.url);

  try {
    let recipeId: number | null = null;
    let quantity: number = 0;
    let prodReq: any = null;

    if (paramId === "preview" || paramId === "new") {
      recipeId = Number(searchParams.get("recipeId"));
      quantity = Number(searchParams.get("quantity")) || 1;
    } else {
      const id = parseInt(paramId, 10);
      if (isNaN(id)) {
        return NextResponse.json({ success: false, message: "Invalid ID." }, { status: 400 });
      }

      prodReq = await prisma.productionRequests.findUnique({
        where: { ProdReqId: id },
        include: {
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

      recipeId = searchParams.get("recipeId") ? Number(searchParams.get("recipeId")) : prodReq.RecipeId;
      quantity = searchParams.get("quantity") ? Number(searchParams.get("quantity")) : Number(prodReq.Quantity);
    }

    if (!recipeId) {
      return NextResponse.json({ success: false, message: "Recipe ID is required." }, { status: 400 });
    }

    const recipe = await prisma.recipes.findUnique({
      where: { RecipeId: recipeId },
      include: {
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
    });

    if (!recipe) {
      return NextResponse.json({ success: false, message: "Recipe not found." }, { status: 404 });
    }

    const multiplier = Number(recipe.OutputQuantity) > 0 ? quantity / Number(recipe.OutputQuantity) : 1;
    const isExistingReq = Boolean(prodReq);
    const isReqReleased = prodReq?.Status === "Rejected" || prodReq?.Status === "Cancelled";

    const suggestions = [];

    for (const ing of recipe.RecipeIngredients) {
      const requiredQty = Number(ing.StandardQuantity) * multiplier;
      let stillNeeded = requiredQty;
      const lotSuggestions = [];
      let totalAvailable = 0;
      const reservedLotIds = new Set<number>();

      // 1. If this is an existing request that is not released, start with its ACTUAL active reservations
      if (isExistingReq && !isReqReleased) {
        const myActiveReservations = (prodReq.ProductionReqLotReservations || []).filter(
          (r: any) => !r.IsReleased && r.IngredientId === ing.IngredientId
        );

        for (const res of myActiveReservations) {
          const lot = res.InventoryLots;
          if (!lot) continue;
          reservedLotIds.add(lot.LotId);

          const remaining = Number(lot.QuantityRemaining);
          const reserved = Number(lot.ReservedQuantity || 0);
          const reservedByThis = Number(res.ReservedQuantity);

          // Available for this request includes its own reservation
          const availableInLot = Math.max(0, remaining - (reserved - reservedByThis));
          totalAvailable += availableInLot;

          // The assigned quantity is strictly what this request reserved
          const suggestedQty = reservedByThis;
          stillNeeded = Math.max(0, stillNeeded - suggestedQty);

          lotSuggestions.push({
            lotId: lot.LotId,
            lotCode: lot.LotCode,
            quantityRemaining: remaining,
            reservedQuantity: reserved,
            availableQuantity: availableInLot,
            suggestedQuantity: suggestedQty,
            expiryDate: lot.ExpiryDate ? lot.ExpiryDate.toISOString() : null,
            receivedDate: lot.ReceivedDate ? lot.ReceivedDate.toISOString() : null,
            status: lot.Status,
          });
        }
      }

      // 2. Query available unreserved lots using FEFO/FIFO for remaining needed stock
      // (For preview, this allocates all lots; for existing request, only if there was a shortfall)
      if (stillNeeded > 0) {
        const otherLots = await prisma.inventoryLots.findMany({
          where: {
            ItemId: ing.ItemId,
            LotId: reservedLotIds.size > 0 ? { notIn: Array.from(reservedLotIds) } : undefined,
            Status: { in: ["Available", "Active"] },
            QuantityRemaining: { gt: 0 },
          },
          orderBy: [
            { ExpiryDate: "asc" },
            { ReceivedDate: "asc" },
          ],
        });

        for (const lot of otherLots) {
          const remaining = Number(lot.QuantityRemaining);
          const reserved = Number(lot.ReservedQuantity || 0);
          const availableInLot = Math.max(0, remaining - reserved);
          if (availableInLot <= 0) continue;

          totalAvailable += availableInLot;

          // If request is already released (Rejected/Cancelled), do not suggest new allocations
          const suggestedQty = isReqReleased ? 0 : Math.min(stillNeeded, availableInLot);
          if (suggestedQty > 0) {
            stillNeeded -= suggestedQty;
          }

          lotSuggestions.push({
            lotId: lot.LotId,
            lotCode: lot.LotCode,
            quantityRemaining: remaining,
            reservedQuantity: reserved,
            availableQuantity: availableInLot,
            suggestedQuantity: suggestedQty,
            expiryDate: lot.ExpiryDate ? lot.ExpiryDate.toISOString() : null,
            receivedDate: lot.ReceivedDate ? lot.ReceivedDate.toISOString() : null,
            status: lot.Status,
          });
        }
      }

      // If the request was released, also display what was previously released for full history
      if (isExistingReq && isReqReleased) {
        const releasedReservations = (prodReq.ProductionReqLotReservations || []).filter(
          (r: any) => r.IsReleased && r.IngredientId === ing.IngredientId
        );
        for (const res of releasedReservations) {
          const lot = res.InventoryLots;
          if (!lot || reservedLotIds.has(lot.LotId)) continue;
          reservedLotIds.add(lot.LotId);

          const remaining = Number(lot.QuantityRemaining);
          const reserved = Number(lot.ReservedQuantity || 0);
          const availableInLot = Math.max(0, remaining - reserved);

          lotSuggestions.push({
            lotId: lot.LotId,
            lotCode: lot.LotCode,
            quantityRemaining: remaining,
            reservedQuantity: reserved,
            availableQuantity: availableInLot,
            suggestedQuantity: 0,
            isReleased: true,
            releasedQuantity: Number(res.ReservedQuantity),
            expiryDate: lot.ExpiryDate ? lot.ExpiryDate.toISOString() : null,
            receivedDate: lot.ReceivedDate ? lot.ReceivedDate.toISOString() : null,
            status: lot.Status,
          });
        }
      }

      const shortfallQty = Math.max(0, requiredQty - totalAvailable);

      suggestions.push({
        ingredientId: ing.IngredientId,
        itemId: ing.ItemId,
        itemName: ing.Items?.ItemName || "",
        itemCode: ing.Items?.ItemCode || "",
        uomId: ing.UomId,
        uomAbbr: ing.Uom?.Abbreviation || ing.Items?.Uom?.Abbreviation || "",
        standardQuantity: Number(ing.StandardQuantity),
        requiredQuantity: requiredQty,
        totalAvailable,
        shortfallQuantity: shortfallQty,
        hasShortfall: shortfallQty > 0,
        lots: lotSuggestions,
      });
    }

    const hasAnyShortfall = suggestions.some((s) => s.hasShortfall);

    return NextResponse.json({
      success: true,
      data: {
        recipeId: recipe.RecipeId,
        recipeName: recipe.RecipeName,
        quantity,
        multiplier,
        hasAnyShortfall,
        ingredients: suggestions,
      },
    });
  } catch (error: any) {
    console.error("GET lot-suggestions error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
