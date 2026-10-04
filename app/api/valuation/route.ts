import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Inventory valuation: weighted average cost per item across all available lots
export async function GET() {
  try {
    const lots = await prisma.inventoryLots.findMany({
      where: { QuantityRemaining: { gt: 0 } },
      include: {
        Items: {
          include: {
            Category: true,
            UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true,
          },
        },
      },
    });

    // Aggregate per item: total value and total qty
    const itemMap = new Map<number, {
      itemId: number;
      itemName: string;
      categoryName: string;
      uomName: string;
      totalQty: number;
      totalValue: number;
      lastReceiptCost: number;
      lastReceiptDate: string | null;
    }>();

    // Sort lots by received date desc to determine "last receipt"
    const sortedLots = [...lots].sort(
      (a, b) => b.ReceivedDate.getTime() - a.ReceivedDate.getTime()
    );

    for (const lot of sortedLots) {
      const item = lot.Items;
      if (!item) continue;
      const uom = item.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures;
      const qty = Number(lot.QuantityRemaining);
      const cost = Number(lot.UnitCost);
      const value = qty * cost;

      const existing = itemMap.get(item.ItemId);
      if (existing) {
        existing.totalQty += qty;
        existing.totalValue += value;
        // Last receipt = first seen in desc-date order
      } else {
        itemMap.set(item.ItemId, {
          itemId: item.ItemId,
          itemName: item.ItemName,
          categoryName: item.Category?.CategoryName ?? "Uncategorized",
          uomName: uom?.Abbreviation ?? "Unit",
          totalQty: qty,
          totalValue: value,
          lastReceiptCost: cost,
          lastReceiptDate: lot.ReceivedDate.toISOString(),
        });
      }
    }

    const items = Array.from(itemMap.values()).map((i) => ({
      itemId: i.itemId,
      itemName: i.itemName,
      categoryName: i.categoryName,
      uomName: i.uomName,
      onHandQty: i.totalQty,
      movingAverageCost: i.totalQty > 0 ? i.totalValue / i.totalQty : 0,
      totalValue: i.totalValue,
      lastReceiptCost: i.lastReceiptCost,
      lastReceiptDate: i.lastReceiptDate,
    }));

    // Sort by totalValue desc
    items.sort((a, b) => b.totalValue - a.totalValue);

    return NextResponse.json({
      success: true,
      data: { items, totalCount: items.length },
    });
  } catch (error: any) {
    console.error("GET /api/valuation error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
