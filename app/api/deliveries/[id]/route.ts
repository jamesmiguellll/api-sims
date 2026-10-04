import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const delivery = await prisma.deliveries.findUnique({
      where: { DeliveryId: id },
      include: {
        PurchaseOrders: { include: { Suppliers: true } },
        DeliveryItems: {
          include: { Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } }, UnitOfMeasures: true, PurchaseOrderItems: true }
        }
      }
    });

    if (!delivery) {
      return NextResponse.json({ success: false, message: `Delivery with ID ${id} not found.` }, { status: 404 });
    }

    const data = {
      deliveryId: delivery.DeliveryId,
      deliveryNumber: delivery.DeliveryNumber,
      poId: delivery.PoId,
      poNumber: delivery.PurchaseOrders?.PoNumber,
      supplierId: delivery.SupplierId,
      supplierName: delivery.PurchaseOrders?.Suppliers?.CompanyName || "",
      receivingLocationId: delivery.ReceivingLocationId,
      status: delivery.Status,
      scheduledDate: delivery.ScheduledDate,
      dispatchedDate: delivery.DispatchedDate,
      expectedArrivalDate: delivery.ExpectedArrivalDate,
      actualArrivalDate: delivery.ActualArrivalDate,
      trackingNumber: delivery.TrackingNumber,
      carrier: delivery.Carrier,
      driverName: delivery.DriverName,
      vehiclePlateNumber: delivery.VehiclePlateNumber,
      deliveryNoteNumber: delivery.DeliveryNoteNumber,
      paymentType: delivery.PaymentType,
      notes: delivery.Notes,
      attachmentUrl: delivery.AttachmentUrl,
      createdAt: delivery.CreatedAt,
      items: delivery.DeliveryItems.map(i => ({
        deliveryItemId: i.DeliveryItemId,
        poItemId: i.PoItemId,
        itemId: i.ItemId,
        itemName: i.Items?.ItemName || "",
        declaredQuantity: Number(i.DeclaredQuantity),
        purchaseUomId: i.PurchaseUomId,
        purchaseUomName: i.UnitOfMeasures?.Abbreviation || i.Items?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "Unit"
      }))
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching delivery:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
