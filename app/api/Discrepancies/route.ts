import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "All";

    const where: any = {};
    if (status !== "All") {
      where.Status = status;
    }

    const discrepancies = await prisma.discrepancies.findMany({
      where,
      orderBy: { CreatedAt: "desc" },
      include: {
        Items: true,
        PurchaseOrders: { include: { Suppliers: true, PurchaseRequisition: true } },
        Deliveries: true,
      }
    });

    const data = discrepancies.map((d: typeof discrepancies[number]) => ({
      discrepancyId: d.DiscrepancyId,
      discrepancyNumber: d.DiscrepancyNumber,
      discrepancyType: d.DiscrepancyType,
      grnId: d.GrnId,
      grnNumber: d.GrnNumber,
      poId: d.PoId,
      poNumber: d.PoNumber,
      prId: d.PurchaseOrders?.PrId,
      prNumber: d.PurchaseOrders?.PurchaseRequisition?.PrNumber,
      supplierName: d.PurchaseOrders?.Suppliers?.CompanyName || "",
      deliveryId: d.DeliveryId,
      deliveryNumber: d.DeliveryNumber,
      itemId: d.ItemId,
      itemName: d.Items?.ItemName || "",
      orderedQuantity: Number(d.OrderedQuantity),
      previouslyReceivedQty: Number(d.PreviouslyReceivedQty),
      currentReceivedQty: Number(d.CurrentReceivedQty),
      discrepancyQuantity: Number(d.DiscrepancyQuantity),
      status: d.Status,
      resolutionType: d.ResolutionType,
      resolutionNotes: d.ResolutionNotes,
      resolvedBy: d.ResolvedBy,
      resolvedAt: d.ResolvedAt,
      createdAt: d.CreatedAt
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching Discrepancies:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
