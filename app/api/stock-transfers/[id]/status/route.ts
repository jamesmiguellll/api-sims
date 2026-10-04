import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();
    const newStatus = body.status as string;

    const transfer = await prisma.stockTransfers.findUnique({ where: { TransferId: id } });
    if (!transfer) {
      return NextResponse.json({ success: false, message: "Transfer not found." }, { status: 404 });
    }

    const updateData: any = { Status: newStatus };
    if (newStatus === "Dispatched") updateData.DispatchedDate = new Date();
    if (newStatus === "Received") {
      updateData.ReceivedDate = new Date();
      updateData.ReceivedBy = body.receivedBy ?? "";
    }

    const updated = await prisma.stockTransfers.update({
      where: { TransferId: id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: { transferId: updated.TransferId, status: updated.Status } });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
