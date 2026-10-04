import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await props.params;
  const id = Number.parseInt(rawId, 10);

  if (!Number.isInteger(id)) {
    return NextResponse.json({ success: false, message: "Invalid recipe ID." }, { status: 400 });
  }

  const recipe = await prisma.recipes.findUnique({
    where: { RecipeId: id },
    include: {
      RecipeIngredients: { include: { Items: true, Uom: true } },
      Product: { include: { Items: { include: { Uom: true } } } },
    },
  });

  if (!recipe) {
    return NextResponse.json({ success: false, message: `Recipe with ID ${id} not found.` }, { status: 404 });
  }

  const unit = recipe.Product.Items.Uom.Abbreviation;
  const yieldLabel = unit?.trim() ? `Good for 1 ${unit}` : "Good for 1";

  return NextResponse.json({
    success: true,
    data: {
      recipeId: recipe.RecipeId,
      recipeCode: recipe.RecipeCode,
      recipeName: recipe.RecipeName,
      displayName: `${recipe.RecipeName} — ${yieldLabel}`,
      yieldLabel,
      productId: recipe.ProductId,
      outputQuantity: 1,
      notes: recipe.Notes,
      isActive: recipe.IsActive,
      ingredients: recipe.RecipeIngredients.map((ingredient) => ({
        ingredientId: ingredient.IngredientId,
        itemId: ingredient.ItemId,
        itemName: ingredient.Items.ItemName,
        uomId: ingredient.UomId,
        uomName: ingredient.Uom.Abbreviation,
        standardQuantity: Number(ingredient.StandardQuantity),
      })),
    },
  });
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();
    
    const recipe = await prisma.recipes.findUnique({
      where: { RecipeId: id },
      include: {
        RecipeIngredients: true,
        Product: { include: { Items: { include: { Uom: true } } } }
      }
    });

    if (!recipe) return NextResponse.json({ success: false, message: `Recipe with ID ${id} not found.` }, { status: 404 });

    let normalizedName = recipe.RecipeName;
    if (body.recipeName) {
      normalizedName = body.recipeName.trim();
      normalizedName = normalizedName.replace(/\s*(?:[-–—]\s*)?(?:good\s+for\s+)?\d+(?:\.\d+)?\s*(?:pcs?|pieces?|g|kg|grams?|kilograms?|ml|l|liters?|litres?|servings?|containers?)\s*$/i, "");
      normalizedName = normalizedName.replace(/\s+pcs?\s*$/i, "").trim();

      if (!normalizedName) {
        return NextResponse.json({ success: false, message: "Recipe name must contain the dish or product name, without a yield suffix." }, { status: 400 });
      }
    }

    if (body.ingredients && Array.isArray(body.ingredients)) {
      for (const ing of body.ingredients) {
        if (ing.itemId === recipe.Product?.ItemId) {
          return NextResponse.json({ success: false, message: "A finished product cannot be an ingredient of its own recipe." }, { status: 400 });
        }
        if (ing.standardQuantity <= 0) {
          return NextResponse.json({ success: false, message: "Ingredient quantities must be greater than zero." }, { status: 400 });
        }

        const item = await prisma.items.findUnique({
          where: { ItemId: ing.itemId },
          include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true, Category: true }
        });
        if (!item) return NextResponse.json({ success: false, message: `Ingredient Item with ID ${ing.itemId} does not exist.` }, { status: 400 });
        if (item.Category?.CategoryName?.toLowerCase() !== "ingredients") {
          return NextResponse.json({ success: false, message: `'${item.ItemName}' must be classified under Ingredients before it can be used in a recipe.` }, { status: 400 });
        }

        const uom = await prisma.unitOfMeasures.findUnique({ where: { UomId: ing.uomId } });
        if (!uom) return NextResponse.json({ success: false, message: `Unit of Measure with ID ${ing.uomId} does not exist.` }, { status: 400 });

        if (ing.uomId !== item.StockUomId) {
          const fromUom = uom;
          const toUom = await prisma.unitOfMeasures.findUnique({ where: { UomId: item.StockUomId! } });
          
          if (!fromUom || !toUom || fromUom.UomType !== toUom.UomType || Number(fromUom.ConversionFactor) <= 0 || Number(toUom.ConversionFactor) <= 0) {
            const abbrev = item.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "an unknown unit";
            const ingAbbrev = fromUom?.Abbreviation || `unit ${ing.uomId}`;
            return NextResponse.json({ success: false, message: `'${item.ItemName}' is stocked in ${abbrev}, which cannot be converted from ${ingAbbrev}. Choose a unit that measures the same thing.` }, { status: 400 });
          }
        }
      }

      // Update Ingredients
      const reqItemIds = body.ingredients.map((i: any) => i.itemId);
      const toRemove = recipe.RecipeIngredients.filter(ri => !reqItemIds.includes(ri.ItemId));

      // Remove unlisted ingredients
      if (toRemove.length > 0) {
        await prisma.recipeIngredients.deleteMany({
          where: {
            RecipeId: id,
            ItemId: { in: toRemove.map(ri => ri.ItemId) }
          }
        });
      }

      // Upsert the remaining/new ingredients
      for (const ing of body.ingredients) {
        const existingIngredient = recipe.RecipeIngredients.find(ri => ri.ItemId === ing.itemId);
        if (existingIngredient) {
          await prisma.recipeIngredients.update({
            where: { IngredientId: existingIngredient.IngredientId },
            data: { StandardQuantity: ing.standardQuantity, UomId: ing.uomId },
          });
        } else {
          await prisma.recipeIngredients.create({
            data: { RecipeId: id, ItemId: ing.itemId, UomId: ing.uomId, StandardQuantity: ing.standardQuantity },
          });
        }
      }
    }

    const updatedRecipe = await prisma.recipes.update({
      where: { RecipeId: id },
      data: {
        RecipeName: normalizedName,
        Notes: body.notes !== undefined ? body.notes : undefined,
        IsActive: body.isActive !== undefined ? body.isActive : undefined,
        OutputQuantity: 1, // GoodForOneYield
      },
      include: {
        RecipeIngredients: { include: { Items: true, Uom: true } },
        Product: { include: { Items: { include: { Uom: true } } } }
      }
    });

    const unit = updatedRecipe.Product?.Items?.Uom?.Abbreviation;
    const yieldLabel = !unit || unit.trim() === "" ? "Good for 1" : `Good for 1 ${unit}`;

    const response = {
      recipeId: updatedRecipe.RecipeId,
      recipeCode: updatedRecipe.RecipeCode,
      recipeName: updatedRecipe.RecipeName,
      displayName: `${updatedRecipe.RecipeName} — ${yieldLabel}`,
      yieldLabel: yieldLabel,
      productId: updatedRecipe.ProductId,
      outputQuantity: 1,
      notes: updatedRecipe.Notes,
      isActive: updatedRecipe.IsActive,
      ingredients: updatedRecipe.RecipeIngredients.map(i => ({
        ingredientId: i.IngredientId,
        itemId: i.ItemId,
        uomId: i.UomId,
        standardQuantity: Number(i.StandardQuantity)
      }))
    };

    return NextResponse.json({ success: true, message: "Recipe updated successfully", data: response });
  } catch (error: any) {
    console.error("Error updating recipe:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const recipe = await prisma.recipes.findUnique({
      where: { RecipeId: id },
    });
    
    if (!recipe) return NextResponse.json({ success: false, message: `Recipe with ID ${id} not found.` }, { status: 404 });

    // Since RecipeIngredients has a cascade delete in the schema normally, but just to be safe, delete them first.
    await prisma.recipeIngredients.deleteMany({ where: { RecipeId: id } });
    await prisma.recipes.delete({ where: { RecipeId: id } });
    
    return NextResponse.json({ success: true, message: "Recipe deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting recipe:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
