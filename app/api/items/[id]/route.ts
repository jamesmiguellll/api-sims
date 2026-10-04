import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const item = await prisma.items.findUnique({
      where: { ItemId: id },
      include: {
        Uom: true,
        Category: true,
        Inventories: true,
      }
    });

    if (!item) return NextResponse.json({ success: false, message: "Item not found" }, { status: 404 });

    const response = {
      itemId: item.ItemId,
      itemCode: item.ItemCode,
      itemName: item.ItemName,
      uomId: item.UomId,
      categoryId: item.CategoryId,
      minStockLevel: Number(item.MinStockLevel),
      maxStockLevel: Number(item.MaxStockLevel),
      isActive: item.IsActive,
      uomName: item.Uom?.Name,
      categoryName: item.Category?.CategoryName,
      currentStock: item.Inventories.reduce((sum, inv) => sum + Number(inv.CurrentStock), 0),
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error: any) {
    console.error("Error fetching item:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();
    
    const existingItem = await prisma.items.findUnique({ where: { ItemId: id } });
    if (!existingItem) return NextResponse.json({ success: false, message: "Item not found" }, { status: 404 });

    if (body.itemName && body.itemName.toLowerCase() !== existingItem.ItemName.toLowerCase()) {
      const trimmedName = body.itemName.trim();
      if (!trimmedName) return NextResponse.json({ success: false, message: "Supply item name cannot be empty." }, { status: 400 });
      if (trimmedName.length > 50) return NextResponse.json({ success: false, message: "Supply item name cannot exceed 50 characters." }, { status: 400 });
      if (!/^[a-zA-Z\s]+$/.test(trimmedName)) return NextResponse.json({ success: false, message: "Supply item name can only contain letters." }, { status: 400 });

      const nameExists = await prisma.items.findFirst({
        where: { ItemName: { equals: trimmedName.toLowerCase(), mode: 'insensitive' }, ItemId: { not: id } }
      });
      if (nameExists) return NextResponse.json({ success: false, message: "An item with this name already exists." }, { status: 400 });
    }

    const nextMin = body.minStockLevel ?? Number(existingItem.MinStockLevel);
    const nextMax = body.maxStockLevel ?? Number(existingItem.MaxStockLevel);
    if (body.minStockLevel !== undefined && body.minStockLevel <= 0) return NextResponse.json({ success: false, message: "Min stock level must be greater than 0." }, { status: 400 });
    if (body.maxStockLevel !== undefined && body.maxStockLevel <= 0) return NextResponse.json({ success: false, message: "Max stock level must be greater than 0." }, { status: 400 });
    if (nextMax < nextMin) return NextResponse.json({ success: false, message: "Max stock level cannot be less than min stock level." }, { status: 400 });

    if (body.categoryId) {
      const category = await prisma.categories.findUnique({ where: { CategoryId: body.categoryId } });
      if (!category) return NextResponse.json({ success: false, message: "Invalid Category ID" }, { status: 400 });
      const allowedCategories = ["Raw Materials", "Ingredients", "Tools and Supplies"];
      if (!allowedCategories.includes(category.CategoryName)) {
        return NextResponse.json({ success: false, message: "Category must be 'Raw Materials', 'Ingredients', or 'Tools and Supplies'." }, { status: 400 });
      }
    }

    if (body.uomId) {
      const uomExists = await prisma.unitOfMeasures.findUnique({ where: { UomId: body.uomId } });
      if (!uomExists) return NextResponse.json({ success: false, message: "Invalid UOM ID" }, { status: 400 });
    }

    const updatedItem = await prisma.items.update({
      where: { ItemId: id },
      data: {
        ItemName: body.itemName !== undefined ? body.itemName : undefined,
        UomId: body.uomId !== undefined ? body.uomId : undefined,
        StockUomId: body.uomId !== undefined ? body.uomId : undefined,
        CategoryId: body.categoryId !== undefined ? body.categoryId : undefined,
        MinStockLevel: body.minStockLevel !== undefined ? body.minStockLevel : undefined,
        MaxStockLevel: body.maxStockLevel !== undefined ? body.maxStockLevel : undefined,
        IsActive: body.isActive !== undefined ? body.isActive : undefined,
      },
      include: {
        Uom: true,
        Category: true,
        Inventories: true,
      }
    });

    const response = {
      itemId: updatedItem.ItemId,
      itemCode: updatedItem.ItemCode,
      itemName: updatedItem.ItemName,
      uomId: updatedItem.UomId,
      categoryId: updatedItem.CategoryId,
      minStockLevel: Number(updatedItem.MinStockLevel),
      maxStockLevel: Number(updatedItem.MaxStockLevel),
      isActive: updatedItem.IsActive,
      uomName: updatedItem.Uom?.Name,
      categoryName: updatedItem.Category?.CategoryName,
      currentStock: updatedItem.Inventories.reduce((sum, inv) => sum + Number(inv.CurrentStock), 0),
    };

    return NextResponse.json({ success: true, message: "Item updated successfully", data: response });
  } catch (error: any) {
    console.error("Error updating item:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const item = await prisma.items.findUnique({
      where: { ItemId: id },
      include: { Inventories: true }
    });
    
    if (!item) return NextResponse.json({ success: false, message: "Item not found" }, { status: 404 });
    const hasStock = item.Inventories.some(inv => Number(inv.CurrentStock) > 0);
    if (hasStock) return NextResponse.json({ success: false, message: "Cannot delete item with existing stock." }, { status: 400 });

    await prisma.items.delete({ where: { ItemId: id } });
    
    return NextResponse.json({ success: true, message: "Item deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting item:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
