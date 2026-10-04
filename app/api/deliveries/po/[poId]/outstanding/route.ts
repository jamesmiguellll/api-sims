import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ poId: string }> }) {
  const params = await props.params;
  try {
    const poId = parseInt(params.poId, 10);
    
    const po = await prisma.purchaseOrders.findUnique({
      where: { PoId: poId },
      include: {
        PurchaseOrderItems: {
          include: { Items: true, UnitOfMeasures: true }
        }
      }
    });

    if (!po) {
      return NextResponse.json({ success: false, message: `Purchase order ${poId} not found.` }, { status: 404 });
    }

    const inFlightDeliveries = await prisma.deliveryItems.groupBy({
      by: ['PoItemId'],
      where: {
        PoItemId: { in: po.PurchaseOrderItems.map(i => i.PoItemId) },
        Deliveries: { Status: { in: ["Scheduled", "InTransit", "Arrived"] } }
      },
      _sum: { DeclaredQuantity: true }
    });

    const inFlightMap: Record<number, number> = {};
    inFlightDeliveries.forEach(d => {
      inFlightMap[d.PoItemId] = Number(d._sum.DeclaredQuantity || 0);
    });

    const outstandingItems = po.PurchaseOrderItems.map(item => {
      const inFlightQty = inFlightMap[item.PoItemId] || 0;
      const remainingQty = Number(item.PoItemQuantity) - Number(item.ReceivedQuantity) - inFlightQty;
      
      return {
        poItemId: item.PoItemId,
        itemId: item.ItemId,
        itemName: item.Items?.ItemName || "",
        orderedQuantity: Number(item.PoItemQuantity),
        receivedQuantity: Number(item.ReceivedQuantity),
        inFlightQuantity: inFlightQty,
        remainingQuantity: remainingQty > 0 ? remainingQty : 0,
        purchaseUomId: item.PurchaseUomId,
        purchaseUomName: item.UnitOfMeasures?.Abbreviation || "Unit"
      };
    });

    return NextResponse.json({ success: true, data: outstandingItems });
  } catch (error: any) {
    console.error("Error fetching outstanding PO items:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
