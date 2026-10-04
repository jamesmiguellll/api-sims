import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const stockIn = await prisma.stockIns.findUnique({
      where: { StockInId: id },
    });

    if (!stockIn) {
      return NextResponse.json({ success: false, message: `Stock-In ${id} not found.` }, { status: 404 });
    }

    if (stockIn.Status !== "PendingApproval") {
      return NextResponse.json({ success: false, message: `Only Stock-Ins in PendingApproval status can be rejected. Current status: ${stockIn.Status}.` }, { status: 400 });
    }

    const updated = await prisma.stockIns.update({
      where: { StockInId: id },
      data: {
        Status: "Rejected",
        RejectedBy: "System User",
        RejectedAt: new Date(),
        RejectionReason: body.reason,
        Notes: body.notes ? (stockIn.Notes ? `${stockIn.Notes}\nRejection Note: ${body.notes}` : `Rejection Note: ${body.notes}`) : stockIn.Notes,
      }
    });

    return NextResponse.json({ success: true, data: updated, message: "Stock-In rejected successfully." });
  } catch (error: any) {
    console.error("Error rejecting Stock-In:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
