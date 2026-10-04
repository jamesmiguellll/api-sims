import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category");
    const isActiveParam = searchParams.get("isActive");
    const sort = searchParams.get("sort") || "asc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));

    if (search.length > 200) {
      return NextResponse.json({ success: false, message: "Search query cannot exceed 200 characters.", data: null }, { status: 400 });
    }

    // Build the query where clause
    const where: any = {};
    if (category) {
      where.Category = { CategoryName: category };
    }
    if (isActiveParam !== null && isActiveParam !== "") {
      where.IsActive = isActiveParam.toLowerCase() === "true";
    }

    // Fetch items with relations
    const items = await prisma.items.findMany({
      where,
      include: {
        Uom: true,
        Category: true,
        Inventories: true,
      },
      orderBy: { ItemId: sort.toLowerCase() === "desc" ? "desc" : "asc" },
    });

    // Map to response DTO format matching C#
    let formattedItems = items.map(i => ({
      itemId: i.ItemId,
      itemCode: i.ItemCode,
      itemName: i.ItemName,
      uomId: i.UomId,
      categoryId: i.CategoryId,
      uomName: i.Uom?.Name,
      categoryName: i.Category?.CategoryName,
      currentStock: i.Inventories.reduce((sum, inv) => sum + Number(inv.CurrentStock), 0),
      minStockLevel: Number(i.MinStockLevel),
      maxStockLevel: Number(i.MaxStockLevel),
      isActive: i.IsActive
    }));

    // In-memory search filter (replicating the C# logic)
    if (search) {
      const terms = search.split(/\s+/).filter(Boolean);
      formattedItems = formattedItems.filter(item => {
        return terms.every(term => {
          const lowerTerm = term.toLowerCase();
          const codeMatch = item.itemCode?.toLowerCase().includes(lowerTerm);
          const idMatch = item.itemId.toString().includes(lowerTerm);
          const nameMatch = item.itemName?.toLowerCase().includes(lowerTerm);
          const categoryMatch = item.categoryName?.toLowerCase().includes(lowerTerm);
          const quantityMatch = item.currentStock.toString().includes(lowerTerm);
          return codeMatch || idMatch || nameMatch || categoryMatch || quantityMatch;
        });
      });
    }

    const totalCount = formattedItems.length;
    const pagedItems = formattedItems.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      success: true,
      message: "Items fetched successfully.",
      data: {
        items: pagedItems,
        totalCount: totalCount,
        page: page,
        pageSize: pageSize
      }
    });
  } catch (error: any) {
    console.error("Error fetching items:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}`, data: null }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const itemName = body.itemName?.trim();
    
    if (!itemName) return NextResponse.json({ success: false, message: "Supply item name is required." }, { status: 400 });
    if (itemName.length > 50) return NextResponse.json({ success: false, message: "Supply item name cannot exceed 50 characters." }, { status: 400 });
    if (!/^[a-zA-Z\s]+$/.test(itemName)) return NextResponse.json({ success: false, message: "Supply item name can only contain letters." }, { status: 400 });
    if (body.minStockLevel <= 0) return NextResponse.json({ success: false, message: "Min stock level must be greater than 0." }, { status: 400 });
    if (body.maxStockLevel <= 0) return NextResponse.json({ success: false, message: "Max stock level must be greater than 0." }, { status: 400 });
    if (body.maxStockLevel < body.minStockLevel) return NextResponse.json({ success: false, message: "Max stock level cannot be less than min stock level." }, { status: 400 });

    const normalizedName = itemName.toLowerCase();
    const nameExists = await prisma.items.findFirst({
      where: { ItemName: { equals: normalizedName, mode: 'insensitive' } }
    });
    if (nameExists) return NextResponse.json({ success: false, message: "An item with this name already exists." }, { status: 400 });

    if (!body.uomId || typeof body.uomId !== 'number') {
      return NextResponse.json({ success: false, message: "Please select a valid Unit of Measurement." }, { status: 400 });
    }
    if (!body.categoryId || typeof body.categoryId !== 'number') {
      return NextResponse.json({ success: false, message: "Please select a valid Category." }, { status: 400 });
    }

    const uom = await prisma.unitOfMeasures.findUnique({ where: { UomId: body.uomId } });
    const category = await prisma.categories.findUnique({ where: { CategoryId: body.categoryId } });
    if (!uom || !category) return NextResponse.json({ success: false, message: "Invalid UOM or Category ID" }, { status: 400 });

    const allowedCategories = ["Raw Materials", "Ingredients", "Tools and Supplies"];
    if (!allowedCategories.includes(category.CategoryName)) {
      return NextResponse.json({ success: false, message: "Category must be 'Raw Materials', 'Ingredients', or 'Tools and Supplies'." }, { status: 400 });
    }

    // Atomic Document Number generation for "Item"
    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "Item", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "Item", Year: year, LastNumber: 1 },
    });
    const itemCode = `SPL-${year}-${String(seq.LastNumber).padStart(4, '0')}`;

    const newItem = await prisma.items.create({
      data: {
        ItemCode: itemCode,
        ItemName: itemName,
        UomId: body.uomId,
        StockUomId: body.uomId,
        CategoryId: body.categoryId,
        MinStockLevel: body.minStockLevel,
        MaxStockLevel: body.maxStockLevel,
        IsActive: body.isActive ?? true,
      },
      include: {
        Uom: true,
        Category: true,
      }
    });

    const response = {
      itemId: newItem.ItemId,
      itemCode: newItem.ItemCode,
      itemName: newItem.ItemName,
      uomId: newItem.UomId,
      categoryId: newItem.CategoryId,
      minStockLevel: Number(newItem.MinStockLevel),
      maxStockLevel: Number(newItem.MaxStockLevel),
      isActive: newItem.IsActive,
      uomName: newItem.Uom?.Name,
      categoryName: newItem.Category?.CategoryName,
      currentStock: 0,
    };

    // Note: audit logging would go here

    return NextResponse.json({ success: true, message: "Item created successfully", data: response });
  } catch (error: any) {
    console.error("Error creating item:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
