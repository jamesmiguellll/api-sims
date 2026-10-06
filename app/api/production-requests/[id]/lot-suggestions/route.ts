import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const paramId = params.id;
  const { searchParams } = new URL(request.url);

  try {
    let recipeId: number | null = null;
    let quantity: number = 0;
    let existingReservations: { [key: string]: number } = {};

    if (paramId === "preview" || paramId === "new") {
      recipeId = Number(searchParams.get("recipeId"));
      quantity = Number(searchParams.get("quantity")) || 1;
    } else {
      const id = parseInt(paramId, 10);
      if (isNaN(id)) {
        return NextResponse.json({ success: false, message: "Invalid ID." }, { status: 400 });
      }

      const prodReq = await prisma.productionRequests.findUnique({
        where: { ProdReqId: id },
        include: {
          ProductionReqLotReservations: true,
        },
      });

      if (!prodReq) {
        return NextResponse.json({ success: false, message: "Production request not found." }, { status: 404 });
      }

      recipeId = searchParams.get("recipeId") ? Number(searchParams.get("recipeId")) : prodReq.RecipeId;
      quantity = searchParams.get("quantity") ? Number(searchParams.get("quantity")) : Number(prodReq.Quantity);

      // Track existing reservations made by this request
      for (const res of prodReq.ProductionReqLotReservations) {
        if (!res.IsReleased) {
          const key = `${res.IngredientId}_${res.LotId}`;
          existingReservations[key] = (existingReservations[key] || 0) + Number(res.ReservedQuantity);
        }
      }
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

    const suggestions = [];

    for (const ing of recipe.RecipeIngredients) {
      const requiredQty = Number(ing.StandardQuantity) * multiplier;
      let stillNeeded = requiredQty;

      // Query available lots
      const lots = await prisma.inventoryLots.findMany({
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

      const lotSuggestions = [];
      let totalAvailable = 0;

      for (const lot of lots) {
        const remaining = Number(lot.QuantityRemaining);
        const reserved = Number(lot.ReservedQuantity || 0);
        const myRes = existingReservations[`${ing.IngredientId}_${lot.LotId}`] || 0;
        const availableInLot = Math.max(0, remaining - (reserved - myRes));

        totalAvailable += availableInLot;

        const suggestedQty = Math.min(stillNeeded, availableInLot);
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
