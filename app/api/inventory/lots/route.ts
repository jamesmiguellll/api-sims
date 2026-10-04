import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";
    const itemId = searchParams.get("itemId") ? parseInt(searchParams.get("itemId")!, 10) : null;

    const where: any = {};

    if (status) {
      where.Status = status;
    }

    if (itemId) {
      where.ItemId = itemId;
    }

    if (search) {
      where.OR = [
        { LotCode: { contains: search, mode: "insensitive" } },
        { Items: { ItemName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [total, lots] = await Promise.all([
      prisma.inventoryLots.count({ where }),
      prisma.inventoryLots.findMany({
        where,
        include: {
          Items: {
            include: {
              Category: true,
              UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true,
            },
          },
          Locations: true,
          Suppliers: true,
          UnitOfMeasures: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ ExpiryDate: "asc" }, { LotId: "asc" }],
      }),
    ]);

    const now = new Date();
    const data = lots.map((lot) => {
      const item = lot.Items;
      const uom = lot.UnitOfMeasures ?? item.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures;
      const expiryDate = lot.ExpiryDate ? lot.ExpiryDate.toISOString().split("T")[0] : null;
      const daysToExpiry = expiryDate
        ? Math.ceil((new Date(expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        lotId: lot.LotId,
        lotCode: lot.LotCode,
        itemId: lot.ItemId,
        itemName: item?.ItemName ?? "",
        itemCode: item?.ItemCode ?? "",
        categoryName: item?.Category?.CategoryName ?? "",
        locationId: lot.LocationId,
        locationName: lot.Locations?.LocationName ?? "",
        supplierId: lot.SupplierId ?? null,
        supplierName: lot.Suppliers?.CompanyName ?? "",
        supplierLotNo: lot.SupplierLotNo ?? "",
        sourceType: lot.SourceType,
        quantityReceived: Number(lot.QuantityReceived),
        quantityRemaining: Number(lot.QuantityRemaining),
        uomId: uom?.UomId ?? null,
        uomAbbreviation: uom?.Abbreviation ?? "",
        unitCost: Number(lot.UnitCost),
        status: lot.Status,
        holdReason: lot.HoldReason ?? "",
        receivedDate: lot.ReceivedDate.toISOString(),
        manufactureDate: lot.ManufactureDate?.toISOString().split("T")[0] ?? null,
        expiryDate,
        isExpiryEstimated: lot.IsExpiryEstimated,
        daysToExpiry,
        isExpiringSoon: daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry >= 0,
        isExpired: daysToExpiry !== null && daysToExpiry < 0,
        isOpeningBalance: lot.IsOpeningBalance,
        grnLineId: lot.GrnLineId ?? null,
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
    console.error("GET /api/inventory/lots error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
