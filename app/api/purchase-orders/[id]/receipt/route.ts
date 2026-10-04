import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const order = await prisma.purchaseOrders.findUnique({ where: { PoId: id } });
    if (!order) {
      return NextResponse.json({ success: false, message: "Purchase order not found." }, { status: 404 });
    }

    if (order.ProofImageUrl) {
      const fileName = order.ProofImageUrl.split("/").pop()!;
      const filePath = path.join(process.cwd(), "public", "uploads", "receipts", fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const updatedOrder = await prisma.purchaseOrders.update({
      where: { PoId: id },
      data: { ProofImageUrl: "" },
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

    return NextResponse.json({ success: true, message: "Receipt removed successfully.", data: response });
  } catch (error: any) {
    console.error("Error removing receipt:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}
