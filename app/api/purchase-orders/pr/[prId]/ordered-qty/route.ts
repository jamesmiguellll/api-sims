import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ prId: string }> }) {
  const params = await props.params;
  try {
    const prId = parseInt(params.prId, 10);
    
    const pos = await prisma.purchaseOrders.findMany({
      where: {
        PrId: prId,
        Status: { notIn: ["Cancelled", "Rejected"] }
      },
      include: { PurchaseOrderItems: true }
    });

    const qtyMap: Record<number, number> = {};
    for (const po of pos) {
      for (const item of po.PurchaseOrderItems) {
        if (!qtyMap[item.ItemId]) qtyMap[item.ItemId] = 0;
        qtyMap[item.ItemId] += Number(item.PoItemQuantity);
      }
    }

    const data = Object.keys(qtyMap).map(itemId => ({
      itemId: parseInt(itemId, 10),
      orderedQty: qtyMap[parseInt(itemId, 10)]
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching ordered qty:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
