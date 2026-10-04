import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const grn = await prisma.goodsReceipts.findUnique({
      where: { GrnId: id },
      include: {
        Deliveries: { include: { PurchaseOrders: { include: { Suppliers: true } } } },
        GoodsReceiptItems: {
          include: { Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } }, UnitOfMeasures: true }
        }
      }
    });

    if (!grn) {
      return NextResponse.json({ success: false, message: `Goods Receipt Note ${id} not found.` }, { status: 404 });
    }

    const data = {
      grnId: grn.GrnId,
      grnNumber: grn.GrnNumber,
      poId: grn.PoId,
      poNumber: grn.Deliveries?.PurchaseOrders?.PoNumber,
      deliveryId: grn.DeliveryId,
      deliveryNumber: grn.Deliveries?.DeliveryNumber,
      supplierId: grn.Deliveries?.PurchaseOrders?.SupplierId,
      supplierName: grn.Deliveries?.PurchaseOrders?.Suppliers?.CompanyName || "",
      status: grn.Status,
      receivedDate: grn.ReceivedDate,
      receivedBy: grn.ReceivedBy,
      notes: grn.Notes,
      createdAt: grn.CreatedAt,
      items: grn.GoodsReceiptItems.map(i => ({
        grnItemId: i.GrnItemId,
        itemId: i.ItemId,
        itemName: i.Items?.ItemName || "",
        poItemId: i.PoItemId,
        orderedQuantity: Number(i.OrderedQuantity),
        previouslyReceivedQuantity: Number(i.PreviouslyReceivedQuantity),
        declaredQuantity: i.DeclaredQuantity == null ? null : Number(i.DeclaredQuantity),
        deliveredQuantity: Number(i.DeliveredQuantity),
        varianceQuantity: Number(i.VarianceQuantity),
        varianceType: i.VarianceType,
        deliveryItemId: i.DeliveryItemId,
        purchaseUomId: i.PurchaseUomId,
        purchaseUomName: i.UnitOfMeasures?.Abbreviation || i.Items?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "Unit"
      }))
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching GRN:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const grn = await prisma.goodsReceipts.findUnique({
      where: { GrnId: id },
      include: { GoodsReceiptItems: true }
    });

    if (!grn) {
      return NextResponse.json({ success: false, message: `Goods Receipt Note ${id} not found.` }, { status: 404 });
    }

    if (grn.Status !== "Draft") {
      return NextResponse.json({ success: false, message: `Only Draft GRNs can be edited. Current status: ${grn.Status}.` }, { status: 400 });
    }

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ success: false, message: "GRN must contain at least one item." }, { status: 400 });
    }

    const grnItems = [];
    for (const itemReq of body.items) {
      const oldItem = grn.GoodsReceiptItems.find(i => i.ItemId === itemReq.itemId);
      const declared = oldItem?.DeclaredQuantity == null ? 0 : Number(oldItem.DeclaredQuantity);
      const delivered = Number(itemReq.deliveredQuantity ?? itemReq.actualReceivedQuantity ?? 0);

      if (delivered < 0) {
        return NextResponse.json({ success: false, message: `Actual received quantity cannot be negative.` }, { status: 400 });
      }

      if (!oldItem) {
        return NextResponse.json({ success: false, message: `Item ${itemReq.itemId} is not part of this GRN.` }, { status: 400 });
      }
      const variance = delivered - declared;

      grnItems.push({
        PoItemId: oldItem.PoItemId,
        ItemId: oldItem.ItemId,
        OrderedQuantity: oldItem.OrderedQuantity,
        PreviouslyReceivedQuantity: oldItem.PreviouslyReceivedQuantity,
        DeclaredQuantity: declared,
        DeliveredQuantity: delivered,
        VarianceQuantity: Math.abs(variance),
        VarianceType: variance < 0 ? "Short" : variance > 0 ? "Over" : "Exact",
        DeliveryItemId: oldItem.DeliveryItemId,
        PurchaseUomId: oldItem.PurchaseUomId,
        SupplierLotCode: itemReq.supplierLotCode?.trim() || oldItem.SupplierLotCode,
        ManufactureDate: itemReq.manufactureDate ? new Date(itemReq.manufactureDate) : oldItem.ManufactureDate,
        ExpiryDate: itemReq.expiryDate ? new Date(itemReq.expiryDate) : oldItem.ExpiryDate,
        Notes: itemReq.notes?.trim() || oldItem.Notes,
      });
    }

    await prisma.goodsReceiptItems.deleteMany({ where: { GrnId: id } });

    const updatedGrn = await prisma.goodsReceipts.update({
      where: { GrnId: id },
      data: {
        Notes: body.notes !== undefined ? body.notes?.trim() : grn.Notes,
        GoodsReceiptItems: {
          create: grnItems
        }
      },
      include: {
        Deliveries: { include: { PurchaseOrders: { include: { Suppliers: true } } } },
        GoodsReceiptItems: {
          include: { Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } }, UnitOfMeasures: true }
        }
      }
    });

    const response = {
      grnId: updatedGrn.GrnId,
      grnNumber: updatedGrn.GrnNumber,
      poId: updatedGrn.PoId,
      poNumber: updatedGrn.Deliveries?.PurchaseOrders?.PoNumber,
      deliveryId: updatedGrn.DeliveryId,
      deliveryNumber: updatedGrn.Deliveries?.DeliveryNumber,
      supplierId: updatedGrn.Deliveries?.PurchaseOrders?.SupplierId,
      supplierName: updatedGrn.Deliveries?.PurchaseOrders?.Suppliers?.CompanyName || "",
      status: updatedGrn.Status,
      receivedDate: updatedGrn.ReceivedDate,
      receivedBy: updatedGrn.ReceivedBy,
      notes: updatedGrn.Notes,
      createdAt: updatedGrn.CreatedAt,
      items: updatedGrn.GoodsReceiptItems.map(i => ({
        grnItemId: i.GrnItemId,
        itemId: i.ItemId,
        itemName: i.Items?.ItemName || "",
        poItemId: i.PoItemId,
        orderedQuantity: Number(i.OrderedQuantity),
        previouslyReceivedQuantity: Number(i.PreviouslyReceivedQuantity),
        declaredQuantity: i.DeclaredQuantity == null ? null : Number(i.DeclaredQuantity),
        deliveredQuantity: Number(i.DeliveredQuantity),
        varianceQuantity: Number(i.VarianceQuantity),
        varianceType: i.VarianceType,
        deliveryItemId: i.DeliveryItemId,
        purchaseUomId: i.PurchaseUomId,
        purchaseUomName: i.UnitOfMeasures?.Abbreviation || i.Items?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "Unit"
      }))
    };

    return NextResponse.json({ success: true, message: "Draft GRN updated successfully.", data: response });
  } catch (error: any) {
    console.error("Error updating GRN:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
