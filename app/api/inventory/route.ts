import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));
    const categoryName = searchParams.get("categoryName") || "";
    const search = searchParams.get("search") || "";

    const where: any = {};

    if (categoryName) {
      where.Items = {
        Category: {
          CategoryName: {
            contains: categoryName,
            mode: "insensitive",
          },
        },
      };
    }

    if (search) {
      where.Items = {
        ...where.Items,
        ItemName: { contains: search, mode: "insensitive" },
      };
    }

    const [total, records] = await Promise.all([
      prisma.inventories.count({ where }),
      prisma.inventories.findMany({
        where,
        include: {
          Items: {
            include: {
              Category: true,
              UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true,
              Uom: true,
            },
          },
          Locations: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { Items: { ItemName: "asc" } },
      }),
    ]);

    const data = records.map((inv) => {
      const item = inv.Items;
      const location = inv.Locations;
      const uom = item.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures ?? item.Uom;
      const currentStock = Number(inv.CurrentStock);
      const minStock = Number(item.MinStockLevel);
      const maxStock = Number(item.MaxStockLevel);

      return {
        inventoryId: inv.InventoryId,
        itemId: item.ItemId,
        itemCode: item.ItemCode,
        itemName: item.ItemName,
        categoryId: item.CategoryId,
        categoryName: item.Category?.CategoryName ?? "",
        locationId: inv.LocationId,
        locationName: location?.LocationName ?? "",
        currentStock,
        minStockLevel: minStock,
        maxStockLevel: maxStock,
        uomId: uom?.UomId ?? item.StockUomId,
        uomAbbreviation: uom?.Abbreviation ?? "",
        isLowStock: currentStock <= minStock,
        isOverStock: maxStock > 0 && currentStock > maxStock,
        isLotTracked: item.IsLotTracked,
        isExpiryTracked: item.IsExpiryTracked,
        isActive: item.IsActive,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        items: data,
        totalCount: total,
        totalPages: Math.ceil(total / pageSize),
        page,
        pageSize,
      },
    });
  } catch (error: any) {
    console.error("GET /api/inventory error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
