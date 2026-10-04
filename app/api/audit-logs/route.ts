import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Audit logs from InventoryMovementLogs, filtered by module type
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") || "supply").toLowerCase();

    // Map frontend type to ActionType patterns
    const actionTypeFilters: Record<string, string[]> = {
      supply: ["GRN_POST", "GRN_RECEIVE", "GOODS_RECEIPT", "DELIVERY", "PURCHASE"],
      production: ["BATCH_CREATE", "BATCH_APPROVE", "BATCH_STAGE", "BATCH_COMPLETE", "PRODUCTION"],
      inventory: ["CYCLE_COUNT", "ADJUSTMENT", "TRANSFER", "STOCK_IN", "OPENING_BALANCE"],
      distribution: ["TRANSFER_CREATE", "TRANSFER_DISPATCH", "TRANSFER_RECEIVE", "STOCK_TRANSFER"],
    };

    const filters = actionTypeFilters[type] || [];

    const logs = await prisma.inventoryMovementLogs.findMany({
      where: filters.length > 0
        ? {
            OR: filters.map((f) => ({
              ActionType: { contains: f, mode: "insensitive" as const },
            })),
          }
        : {},
      include: {
        Items: true,
        Locations: true,
      },
      orderBy: { Timestamp: "desc" },
      take: 500,
    });

    const data = logs.map((log) => ({
      id: log.MovementId,
      timestamp: log.Timestamp.toISOString(),
      actionType: log.ActionType,
      itemId: log.ItemId,
      itemName: log.Items?.ItemName ?? "",
      locationId: log.LocationId,
      locationName: log.Locations?.LocationName ?? "",
      changeQuantity: Number(log.ChangeQuantity),
      referenceId: log.ReferenceId,
      userId: log.UserId,
      userName: log.UserName,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("GET /api/audit-logs error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
