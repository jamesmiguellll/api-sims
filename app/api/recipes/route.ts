import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const recipes = await prisma.recipes.findMany({
      include: {
        RecipeIngredients: {
          include: {
            Items: true,
            Uom: true,
          }
        },
        Product: {
          include: {
            Items: {
              include: {
                Uom: true,
              }
            }
          }
        }
      }
    });

    const responseData = recipes.map(recipe => {
      const outputQty = Number(recipe.OutputQuantity) > 0 ? Number(recipe.OutputQuantity) : 100;
      const yieldLabel = `Batch of ${outputQty} pcs`;

      return {
        recipeId: recipe.RecipeId,
        recipeCode: recipe.RecipeCode,
        recipeName: recipe.RecipeName,
        displayName: `${recipe.RecipeName} — ${yieldLabel}`,
        yieldLabel: yieldLabel,
        productId: recipe.ProductId,
        outputQuantity: outputQty,
        notes: recipe.Notes,
        isActive: recipe.IsActive,
        ingredients: recipe.RecipeIngredients.map(i => ({
          ingredientId: i.IngredientId,
          itemId: i.ItemId,
          uomId: i.UomId,
          standardQuantity: Number(i.StandardQuantity)
        }))
      };
    });

    return NextResponse.json({ success: true, data: responseData });
  } catch (error: any) {
    console.error("Error fetching recipes:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const product = await prisma.finishedProducts.findUnique({
      where: { ProductId: body.productId },
      include: { Items: { include: { Uom: true } } }
    });

    if (!product) return NextResponse.json({ success: false, message: `Product with ID ${body.productId} not found.` }, { status: 400 });

    if (!body.ingredients || body.ingredients.length === 0) {
      return NextResponse.json({ success: false, message: "Recipe must have at least one ingredient." }, { status: 400 });
    }

    for (const ing of body.ingredients) {
      if (ing.itemId === product.ItemId) {
        return NextResponse.json({ success: false, message: "A finished product cannot be an ingredient of its own recipe." }, { status: 400 });
      }
      if (ing.standardQuantity <= 0) {
        return NextResponse.json({ success: false, message: "Ingredient quantities must be greater than zero." }, { status: 400 });
      }

      const item = await prisma.items.findUnique({
        where: { ItemId: ing.itemId },
        include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true, Category: true }
      });
      if (!item) return NextResponse.json({ success: false, message: `Item with ID ${ing.itemId} not found.` }, { status: 400 });
      const catName = item.Category?.CategoryName?.toLowerCase() || "";
      if (catName.includes("finished good")) {
        return NextResponse.json({ success: false, message: `'${item.ItemName}' is a finished product and cannot be used as a raw material.` }, { status: 400 });
      }

      if (ing.uomId !== item.StockUomId) {
        const fromUom = await prisma.unitOfMeasures.findUnique({ where: { UomId: ing.uomId } });
        const toUom = await prisma.unitOfMeasures.findUnique({ where: { UomId: item.StockUomId! } });
        
        if (!fromUom || !toUom || fromUom.UomType !== toUom.UomType || Number(fromUom.ConversionFactor) <= 0 || Number(toUom.ConversionFactor) <= 0) {
          const abbrev = item.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "an unknown unit";
          const ingAbbrev = fromUom?.Abbreviation || `unit ${ing.uomId}`;
          return NextResponse.json({ success: false, message: `'${item.ItemName}' is stocked in ${abbrev}, which cannot be converted from ${ingAbbrev}. Choose a unit that measures the same thing.` }, { status: 400 });
        }
      }
    }

    let normalizedName = body.recipeName.trim();
    normalizedName = normalizedName.replace(/\s*(?:[-–—]\s*)?(?:good\s+for\s+)?\d+(?:\.\d+)?\s*(?:pcs?|pieces?|g|kg|grams?|kilograms?|ml|l|liters?|litres?|servings?|containers?)\s*$/i, "");
    normalizedName = normalizedName.replace(/\s+pcs?\s*$/i, "").trim();

    if (!normalizedName) {
      return NextResponse.json({ success: false, message: "Recipe name must contain the dish or product name, without a yield suffix." }, { status: 400 });
    }

    // Atomic Document Number generation for "Recipe" / BOM
    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "Recipe", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "Recipe", Year: year, LastNumber: 1 },
    });
    const recipeCode = `BOM-${year}-${String(seq.LastNumber).padStart(4, '0')}`;

    const outputQty = Number(body.outputQuantity) > 0 ? Number(body.outputQuantity) : 100;

    const newRecipe = await prisma.recipes.create({
      data: {
        RecipeCode: recipeCode,
        RecipeName: normalizedName,
        ProductId: body.productId,
        OutputQuantity: outputQty,
        Notes: body.notes || "",
        IsActive: body.isActive ?? true,
        RecipeIngredients: {
          create: body.ingredients.map((i: any) => ({
            ItemId: i.itemId,
            UomId: i.uomId,
            StandardQuantity: i.standardQuantity,
          }))
        }
      },
      include: {
        RecipeIngredients: {
          include: { Items: true, Uom: true }
        },
        Product: {
          include: { Items: { include: { Uom: true } } }
        }
      }
    });

    const yieldLabel = `Batch of ${outputQty} pcs`;

    const response = {
      recipeId: newRecipe.RecipeId,
      recipeCode: newRecipe.RecipeCode,
      recipeName: newRecipe.RecipeName,
      displayName: `${newRecipe.RecipeName} — ${yieldLabel}`,
      yieldLabel: yieldLabel,
      productId: newRecipe.ProductId,
      outputQuantity: outputQty,
      notes: newRecipe.Notes,
      isActive: newRecipe.IsActive,
      ingredients: newRecipe.RecipeIngredients.map(i => ({
        ingredientId: i.IngredientId,
        itemId: i.ItemId,
        uomId: i.UomId,
        standardQuantity: Number(i.StandardQuantity)
      }))
    };

    return NextResponse.json({ success: true, message: "Recipe created successfully", data: response });
  } catch (error: any) {
    console.error("Error creating recipe:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
