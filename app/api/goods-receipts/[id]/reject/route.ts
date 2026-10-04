import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const grn = await prisma.goodsReceipts.findUnique({
      where: { GrnId: id },
      include: { Deliveries: true }
    });

    if (!grn) {
      return NextResponse.json({ success: false, message: `Goods Receipt Note ${id} not found.` }, { status: 404 });
    }

    if (grn.Status === "Completed" || grn.Status === "Cancelled") {
      return NextResponse.json({ success: false, message: `Cannot reject a GRN in ${grn.Status} status.` }, { status: 400 });
    }

    const reason = body.reason?.trim() || "Rejected by user.";

    const updatedGrn = await prisma.goodsReceipts.update({
      where: { GrnId: id },
      data: { 
        Status: "Rejected",
        Notes: grn.Notes ? `${grn.Notes}\nRejected: ${reason}` : `Rejected: ${reason}`
      }
    });

    if (grn.Deliveries && grn.DeliveryId !== null) {
      await prisma.deliveries.update({
        where: { DeliveryId: grn.DeliveryId },
        data: { Status: "Rejected" }
      });
    }

    return NextResponse.json({ success: true, message: "GRN rejected successfully.", data: updatedGrn });
  } catch (error: any) {
    console.error("Error rejecting GRN:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
