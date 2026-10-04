import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const delivery = await prisma.deliveries.findUnique({
      where: { DeliveryId: id },
    });

    if (!delivery) {
      return NextResponse.json({ success: false, message: `Delivery ${id} not found.` }, { status: 404 });
    }

    if (delivery.Status === "Cancelled" || delivery.Status === "Arrived" || delivery.Status === "Received") {
      return NextResponse.json({ success: false, message: `Cannot cancel a delivery in ${delivery.Status} status.` }, { status: 400 });
    }

    const updatedDelivery = await prisma.deliveries.update({
      where: { DeliveryId: id },
      data: {
        Status: "Cancelled",
        Notes: body.reason ? (delivery.Notes ? `${delivery.Notes}\nCancellation Reason: ${body.reason}` : `Cancellation Reason: ${body.reason}`) : delivery.Notes,
      }
    });

    return NextResponse.json({ success: true, message: "Delivery cancelled successfully.", data: updatedDelivery });
  } catch (error: any) {
    console.error("Error cancelling delivery:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
