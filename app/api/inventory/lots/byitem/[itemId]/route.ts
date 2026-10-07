import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  props: { params: Promise<{ itemId: string }> | { itemId: string } }
) {
  try {
    const rawParams = await props?.params;
    const itemId = parseInt(String(rawParams?.itemId), 10);
    if (isNaN(itemId)) {
      return NextResponse.json({ success: false, message: "Invalid item ID" }, { status: 400 });
    }

    const lots = await prisma.inventoryLots.findMany({
      where: { ItemId: itemId, Status: { in: ["Available", "Active"] }, QuantityRemaining: { gt: 0 } },
      include: {
        Locations: true,
        Suppliers: true,
        UnitOfMeasures: true,
        ProductionReqLotReservations: {
          where: { IsReleased: false },
          include: {
            ProductionRequests: {
              select: { ReqNumber: true, Status: true },
            },
          },
        },
      },
      orderBy: [{ ExpiryDate: "asc" }, { LotId: "asc" }],
    });

    const now = new Date();
    const data = lots.map((lot) => {
      const expiryDate = lot.ExpiryDate ? lot.ExpiryDate.toISOString().split("T")[0] : null;
      const daysToExpiry = expiryDate
        ? Math.ceil((new Date(expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const remaining = Number(lot.QuantityRemaining);
      const reserved = Number(lot.ReservedQuantity || 0);
      const available = Math.max(0, remaining - reserved);

      const reservations = (lot.ProductionReqLotReservations || []).map((r) => ({
        reservationId: r.ReservationId,
        reqNumber: r.ProductionRequests?.ReqNumber || "",
        reservedQuantity: Number(r.ReservedQuantity),
        status: r.ProductionRequests?.Status || "",
      }));

      return {
        lotId: lot.LotId,
        lotCode: lot.LotCode,
        itemId: lot.ItemId,
        locationId: lot.LocationId,
        locationName: lot.Locations?.LocationName ?? "",
        supplierId: lot.SupplierId ?? null,
        supplierName: lot.Suppliers?.CompanyName ?? "",
        supplierLotNo: lot.SupplierLotNo ?? "",
        quantityReceived: Number(lot.QuantityReceived),
        quantityRemaining: remaining,
        reservedQuantity: reserved,
        availableQuantity: available,
        reservations,
        uomAbbreviation: lot.UnitOfMeasures?.Abbreviation ?? "",
        unitCost: Number(lot.UnitCost),
        status: lot.Status,
        receivedDate: lot.ReceivedDate.toISOString(),
        expiryDate,
        daysToExpiry,
        isExpiringSoon: daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry >= 0,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("GET /api/inventory/lots/byitem/[itemId] error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
