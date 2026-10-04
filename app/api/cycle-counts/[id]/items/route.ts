import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const items = await prisma.cycleCountItems.findMany({
      where: { CycleCountId: id },
      include: {
        Items: {
          include: {
            Category: true,
            UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true,
          },
        },
        InventoryLots: true,
      },
      orderBy: { Items: { ItemName: "asc" } },
    });

    const data = items.map((item) => {
      const uom = item.Items?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures;
      const systemQty = Number(item.SystemQuantity);
      const countedQty = Number(item.CountedQuantity);
      return {
        cycleCountItemId: item.CycleCountItemId,
        cycleCountId: item.CycleCountId,
        itemId: item.ItemId,
        itemName: item.Items?.ItemName ?? "",
        itemCode: item.Items?.ItemCode ?? "",
        categoryName: item.Items?.Category?.CategoryName ?? "",
        lotId: item.LotId ?? null,
        lotCode: item.InventoryLots?.LotCode ?? null,
        systemQuantity: systemQty,
        countedQuantity: countedQty,
        variance: countedQty - systemQty,
        unitCost: Number(item.UnitCost),
        uomAbbr: uom?.Abbreviation ?? "",
        reason: item.Reason ?? "",
        notes: item.Notes ?? "",
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
