import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const poId = searchParams.get("poId");
    const status = searchParams.get("status") || "All";
    const eligibleForGrn = searchParams.get("eligibleForGrn") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

    const where: any = {};
    if (poId) {
      where.PoId = parseInt(poId, 10);
    }
    if (status !== "All") {
      where.Status = status;
    }
    if (eligibleForGrn) {
      where.Status = "Arrived";
    }

    const totalCount = await prisma.deliveries.count({ where });

    const deliveries = await prisma.deliveries.findMany({
      where,
      orderBy: { CreatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        PurchaseOrders: { include: { Suppliers: true } },
        DeliveryItems: {
          include: { Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } }, UnitOfMeasures: true, PurchaseOrderItems: true }
        }
      }
    });

    const data = deliveries.map(d => ({
      deliveryId: d.DeliveryId,
      deliveryNumber: d.DeliveryNumber,
      poId: d.PoId,
      poNumber: d.PurchaseOrders?.PoNumber,
      supplierId: d.SupplierId,
      supplierName: d.PurchaseOrders?.Suppliers?.CompanyName || "",
      receivingLocationId: d.ReceivingLocationId,
      status: d.Status,
      scheduledDate: d.ScheduledDate,
      dispatchedDate: d.DispatchedDate,
      expectedArrivalDate: d.ExpectedArrivalDate,
      actualArrivalDate: d.ActualArrivalDate,
      trackingNumber: d.TrackingNumber,
      carrier: d.Carrier,
      driverName: d.DriverName,
      vehiclePlateNumber: d.VehiclePlateNumber,
      deliveryNoteNumber: d.DeliveryNoteNumber,
      paymentType: d.PaymentType,
      notes: d.Notes,
      attachmentUrl: d.AttachmentUrl,
      createdAt: d.CreatedAt,
      items: d.DeliveryItems.map(i => ({
        deliveryItemId: i.DeliveryItemId,
        poItemId: i.PoItemId,
        itemId: i.ItemId,
        itemName: i.Items?.ItemName || "",
        declaredQuantity: Number(i.DeclaredQuantity),
        purchaseUomId: i.PurchaseUomId,
        purchaseUomName: i.UnitOfMeasures?.Abbreviation || i.Items?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "Unit"
      }))
    }));

    return NextResponse.json({ success: true, data: { items: data, totalCount, page, pageSize } });
  } catch (error: any) {
    console.error("Error fetching deliveries:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ success: false, message: "A delivery must contain at least one item." }, { status: 400 });
    }



    const po = await prisma.purchaseOrders.findUnique({
      where: { PoId: body.poId },
      include: { Suppliers: true, PurchaseOrderItems: { include: { Items: true, UnitOfMeasures: true } } }
    });

    if (!po) {
      return NextResponse.json({ success: false, message: `Purchase order ${body.poId} was not found.` }, { status: 404 });
    }

    if (["Cancelled", "Rejected", "Draft", "PendingApproval"].includes(po.Status)) {
      return NextResponse.json({ success: false, message: `Cannot create a delivery for a purchase order in '${po.Status}' status.` }, { status: 400 });
    }

    // Default receiving location: 1 (Main Warehouse / Commissary) if locations logic isn't fully migrated.
    const receivingLocationId = 1; 
    const scheduledDate = body.scheduledDate ? new Date(body.scheduledDate) : new Date();

    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "Delivery", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "Delivery", Year: year, LastNumber: 1 },
    });
    const deliveryNumber = `DLV-${year}-${String(seq.LastNumber).padStart(4, '0')}`;

    const deliveryItems = [];
    for (const itemReq of body.items) {
      const poItem = po.PurchaseOrderItems.find(i => i.PoItemId === itemReq.poItemId);
      if (!poItem) {
        return NextResponse.json({ success: false, message: `PO item ${itemReq.poItemId} does not belong to purchase order ${po.PoNumber}.` }, { status: 400 });
      }

      if (itemReq.declaredQuantity <= 0) {
        return NextResponse.json({ success: false, message: `Shipment quantity for item '${poItem.Items?.ItemName || poItem.ItemId}' must be greater than zero.` }, { status: 400 });
      }

      // Check remaining quantity including in-flight deliveries
      const inFlightDeliveries = await prisma.deliveryItems.aggregate({
        where: {
          PoItemId: poItem.PoItemId,
          Deliveries: { Status: { in: ["Scheduled", "InTransit", "Arrived"] } }
        },
        _sum: { DeclaredQuantity: true }
      });

      const inFlightQuantity = Number(inFlightDeliveries._sum.DeclaredQuantity || 0);
      const remainingQuantity = Number(poItem.PoItemQuantity) - Number(poItem.ReceivedQuantity) - inFlightQuantity;

      if (itemReq.declaredQuantity > remainingQuantity) {
        return NextResponse.json({ success: false, message: `Declared quantity (${itemReq.declaredQuantity}) exceeds remaining outstanding quantity (${remainingQuantity}) for item '${poItem.Items?.ItemName || poItem.ItemId}'.` }, { status: 400 });
      }

      deliveryItems.push({
        PoItemId: poItem.PoItemId,
        ItemId: poItem.ItemId,
        DeclaredQuantity: itemReq.declaredQuantity,
        PurchaseUomId: poItem.PurchaseUomId
      });
    }

    const newDelivery = await prisma.deliveries.create({
      data: {
        DeliveryNumber: deliveryNumber,
        PoId: po.PoId,
        SupplierId: po.SupplierId,
        ReceivingLocationId: receivingLocationId,
        Status: "Scheduled",
        ScheduledDate: scheduledDate,
        ExpectedArrivalDate: body.expectedArrivalDate ? new Date(body.expectedArrivalDate) : po.ExpectedArrivalDate,
        TrackingNumber: body.trackingNumber?.trim(),
        Carrier: body.carrier?.trim(),
        DriverName: body.driverName?.trim(),
        VehiclePlateNumber: body.vehiclePlateNumber?.trim(),
        DeliveryNoteNumber: body.deliveryNoteNumber?.trim(),
        PaymentType: body.paymentType || po.PaymentType,
        Notes: body.notes?.trim(),
        AttachmentUrl: body.attachmentUrl?.trim(),
        CreatedBy: "User", // This would normally come from session
        CreatedAt: new Date(),
        DeliveryItems: {
          create: deliveryItems
        }
      },
      include: {
        PurchaseOrders: { include: { Suppliers: true } },
        DeliveryItems: {
          include: { Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } }, UnitOfMeasures: true }
        }
      }
    });

    if (po.Status === "Approved") {
      await prisma.purchaseOrders.update({
        where: { PoId: po.PoId },
        data: { Status: "Ordered" }
      });
    }

    const response = {
      deliveryId: newDelivery.DeliveryId,
      deliveryNumber: newDelivery.DeliveryNumber,
      poId: newDelivery.PoId,
      poNumber: newDelivery.PurchaseOrders?.PoNumber,
      supplierId: newDelivery.SupplierId,
      supplierName: newDelivery.PurchaseOrders?.Suppliers?.CompanyName || "",
      status: newDelivery.Status,
      items: newDelivery.DeliveryItems.map(i => ({
        deliveryItemId: i.DeliveryItemId,
        poItemId: i.PoItemId,
        itemId: i.ItemId,
        itemName: i.Items?.ItemName || "",
        declaredQuantity: Number(i.DeclaredQuantity),
      }))
    };

    return NextResponse.json({ success: true, message: "Delivery scheduled successfully.", data: response });
  } catch (error: any) {
    console.error("Error creating delivery:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
