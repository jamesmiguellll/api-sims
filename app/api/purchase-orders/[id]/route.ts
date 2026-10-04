import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const po = await prisma.purchaseOrders.findUnique({
      where: { PoId: id },
      include: {
        Suppliers: true,
        PurchaseRequisition: true,
        PurchaseOrderItems: {
          include: {
            Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } },
            UnitOfMeasures: true
          }
        }
      }
    });

    if (!po) {
      return NextResponse.json({ success: false, message: `Purchase order with ID ${id} not found.` }, { status: 404 });
    }

    const data = {
      poId: po.PoId,
      prId: po.PrId,
      prNumber: po.PurchaseRequisition?.PrNumber,
      supplierId: po.SupplierId,
      supplierName: po.Suppliers?.CompanyName || "",
      orderDate: po.OrderDate,
      poNumber: po.PoNumber,
      expectedArrivalDate: po.ExpectedArrivalDate,
      status: po.Status,
      paymentType: po.PaymentType,
      totalAmount: Number(po.TotalAmount),
      requestedBy: po.RequestedBy,
      adminNotes: po.AdminNotes,
      qaNotes: po.QaNotes,
      qaInspectedDate: po.QaInspectedDate,
      qaStatus: po.QaStatus,
      inspectedBy: po.InspectedBy,
      items: po.PurchaseOrderItems.map(i => ({
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

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching purchase order:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const order = await prisma.purchaseOrders.findUnique({
      where: { PoId: id },
      include: { PurchaseOrderItems: true }
    });

    if (!order) {
      return NextResponse.json({ success: false, message: `Purchase order with ID ${id} not found.` }, { status: 404 });
    }

    if (order.Status !== "Draft" && order.Status !== "Returned") {
      return NextResponse.json({ success: false, message: `Only Draft or Returned orders can be modified. Current status: ${order.Status}.` }, { status: 400 });
    }

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ success: false, message: "Purchase order must contain at least one item." }, { status: 400 });
    }

    let expectedArrivalDate = body.expectedArrivalDate ? new Date(body.expectedArrivalDate) : order.ExpectedArrivalDate;

    const poItems: Array<{
      ItemId: number;
      SupplierId: number;
      PoItemQuantity: number;
      TotalPrice: number;
      PurchaseUomId: number;
      ReceivedQuantity: number;
    }> = [];
    for (const itemReq of body.items) {
      if (itemReq.poItemQuantity <= 0) {
        return NextResponse.json({ success: false, message: "Quantity must be greater than zero." }, { status: 400 });
      }

      const item = await prisma.items.findUnique({ where: { ItemId: itemReq.itemId } });
      if (!item) {
        return NextResponse.json({ success: false, message: `Item with ID ${itemReq.itemId} not found.` }, { status: 400 });
      }

      const catalogEntry = await prisma.supplierItems.findFirst({
        where: { SupplierId: body.supplierId, ItemId: itemReq.itemId }
      });
      if (!catalogEntry) {
        return NextResponse.json({ success: false, message: `No supplier price is configured for '${item.ItemName}'.` }, { status: 400 });
      }
      if (Number(catalogEntry.UnitPrice) <= 0) {
        return NextResponse.json({ success: false, message: `Supplier price for '${item.ItemName}' must be greater than zero.` }, { status: 400 });
      }

      let purchaseUomId = itemReq.purchaseUomId ?? catalogEntry.PurchaseUomId;
      if (!purchaseUomId || purchaseUomId <= 0) {
        purchaseUomId = item.StockUomId;
      }

      poItems.push({
        ItemId: itemReq.itemId,
        SupplierId: body.supplierId,
        PoItemQuantity: itemReq.poItemQuantity,
        TotalPrice: Number(catalogEntry.UnitPrice) * Number(itemReq.poItemQuantity),
        PurchaseUomId: purchaseUomId,
        ReceivedQuantity: 0
      });
    }

    const calculatedTotal = poItems.reduce((acc, item) => acc + item.TotalPrice, 0);

    let newStatus = order.Status;
    if (body.initialStatus && body.initialStatus !== "Unspecified") {
      newStatus = body.initialStatus;
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItems.deleteMany({
        where: { OR: [{ PoId: id }, { PurchaseOrderPoId: id }] },
      });

      await tx.purchaseOrders.update({
        where: { PoId: id },
        data: {
          SupplierId: body.supplierId || order.SupplierId,
          ExpectedArrivalDate: expectedArrivalDate,
          PaymentType: body.paymentType || order.PaymentType,
          Status: newStatus,
          TotalAmount: calculatedTotal,
          RequestedBy: body.requestedBy || order.RequestedBy,
        },
      });

      await tx.purchaseOrderItems.createMany({
        data: poItems.map((item) => ({
          ...item,
          PoId: id,
          PurchaseOrderPoId: id,
        })),
      });

      return tx.purchaseOrders.findUniqueOrThrow({
        where: { PoId: id },
        include: {
          Suppliers: true,
          PurchaseRequisition: true,
          PurchaseOrderItems: {
            include: {
              Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } },
              UnitOfMeasures: true,
            },
          },
        },
      });
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

    return NextResponse.json({ success: true, message: "Purchase order updated successfully", data: response });
  } catch (error: any) {
    console.error("Error updating purchase order:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
