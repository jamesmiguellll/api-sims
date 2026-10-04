import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const delivery = await prisma.deliveries.findUnique({
      where: { DeliveryId: id },
      include: { PurchaseOrders: true }
    });

    if (!delivery) {
      return NextResponse.json({ success: false, message: `Delivery ${id} not found.` }, { status: 404 });
    }

    if (delivery.Status !== "Scheduled") {
      return NextResponse.json({ success: false, message: `Only Scheduled deliveries can be dispatched. Current status: ${delivery.Status}.` }, { status: 400 });
    }

    const updatedDelivery = await prisma.deliveries.update({
      where: { DeliveryId: id },
      data: {
        Status: "InTransit",
        DispatchedDate: body.dispatchedDate ? new Date(body.dispatchedDate) : new Date(),
        ExpectedArrivalDate: body.expectedArrivalDate ? new Date(body.expectedArrivalDate) : delivery.ExpectedArrivalDate,
        TrackingNumber: body.trackingNumber?.trim() || delivery.TrackingNumber,
        Carrier: body.carrier?.trim() || delivery.Carrier,
        DriverName: body.driverName?.trim() || delivery.DriverName,
        VehiclePlateNumber: body.vehiclePlateNumber?.trim() || delivery.VehiclePlateNumber,
        DeliveryNoteNumber: body.deliveryNoteNumber?.trim() || delivery.DeliveryNoteNumber,
        Notes: body.notes?.trim() || delivery.Notes,
      }
    });

    return NextResponse.json({ success: true, message: "Delivery marked as dispatched.", data: updatedDelivery });
  } catch (error: any) {
    console.error("Error dispatching delivery:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
