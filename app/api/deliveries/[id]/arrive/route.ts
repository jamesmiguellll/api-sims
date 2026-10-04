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

    if (delivery.Status !== "InTransit" && delivery.Status !== "Scheduled") {
      return NextResponse.json({ success: false, message: `Only Scheduled or In-Transit deliveries can be marked as arrived. Current status: ${delivery.Status}.` }, { status: 400 });
    }

    const updatedDelivery = await prisma.deliveries.update({
      where: { DeliveryId: id },
      data: {
        Status: "Arrived",
        ActualArrivalDate: body.actualArrivalDate ? new Date(body.actualArrivalDate) : new Date(),
        DeliveryNoteNumber: body.deliveryNoteNumber?.trim() || delivery.DeliveryNoteNumber,
        Notes: body.notes?.trim() || delivery.Notes,
      }
    });

    return NextResponse.json({ success: true, message: "Delivery marked as arrived.", data: updatedDelivery });
  } catch (error: any) {
    console.error("Error arriving delivery:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
