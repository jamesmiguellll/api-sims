import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const order = await prisma.purchaseOrders.findUnique({
      where: { PoId: id },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: `Purchase order ${id} not found.` }, { status: 404 });
    }

    const validStatuses = ["Draft", "PendingApproval", "Approved", "Rejected", "Returned", "PartiallyDelivered", "Delivered", "Cancelled"];
    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json({ success: false, message: `Invalid status '${body.status}'. Allowed: ${validStatuses.join(", ")}.` }, { status: 400 });
    }

    const updateData: any = {
      UpdatedAt: new Date(),
    };

    if (body.status) updateData.Status = body.status;
    if (body.qaStatus) updateData.QaStatus = body.qaStatus;
    if (body.qaNotes) updateData.QaNotes = body.qaNotes;
    if (body.inspectedBy) updateData.InspectedBy = body.inspectedBy;
    if (body.qaStatus && body.qaStatus !== "Pending") {
      updateData.QaInspectedDate = new Date();
    }
    if (body.adminNotes) updateData.AdminNotes = body.adminNotes;
    if (body.comments) updateData.AdminNotes = body.comments; // Fallback

    const updatedOrder = await prisma.purchaseOrders.update({
      where: { PoId: id },
      data: updateData,
      include: {
        Suppliers: true,
        PurchaseRequisition: true,
        PurchaseOrderItems: {
          include: { Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } }, UnitOfMeasures: true }
        }
      }
    });

    const response = {
      poId: updatedOrder.PoId,
      prId: updatedOrder.PrId,
      prNumber: updatedOrder.PurchaseRequisition?.PrNumber,
      supplierId: updatedOrder.SupplierId,
      supplierName: updatedOrder.Suppliers?.CompanyName || "",
      orderDate: updatedOrder.OrderDate,
      poNumber: updatedOrder.PoNumber,
      expectedArrivalDate: updatedOrder.ExpectedArrivalDate,
      status: updatedOrder.Status,
      paymentType: updatedOrder.PaymentType,
      totalAmount: Number(updatedOrder.TotalAmount),
      requestedBy: updatedOrder.RequestedBy,
      adminNotes: updatedOrder.AdminNotes,
      qaNotes: updatedOrder.QaNotes,
      qaInspectedDate: updatedOrder.QaInspectedDate,
      qaStatus: updatedOrder.QaStatus,
      inspectedBy: updatedOrder.InspectedBy,
      items: updatedOrder.PurchaseOrderItems.map(i => ({
        poItemId: i.PoItemId,
        itemId: i.ItemId,
        itemName: i.Items?.ItemName || "",
        poItemQuantity: Number(i.PoItemQuantity),
        receivedQuantity: Number(i.ReceivedQuantity),
        totalPrice: Number(i.TotalPrice),
        purchaseUomId: i.PurchaseUomId,
        purchaseUomName: i.UnitOfMeasures?.Abbreviation || i.Items?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "Unit"
      }))
    };

    return NextResponse.json({ success: true, message: `Order status updated to ${body.status || body.qaStatus}.`, data: response });
  } catch (error: any) {
    console.error("Error updating status on PO:", error);
    return NextResponse.json({ success: false, message: "An error occurred while updating status." }, { status: 500 });
  }
}
