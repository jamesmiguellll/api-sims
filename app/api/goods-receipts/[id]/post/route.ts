import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const grn = await prisma.goodsReceipts.findUnique({
      where: { GrnId: id },
    });

    if (!grn) {
      return NextResponse.json({ success: false, message: `Goods Receipt Note ${id} not found.` }, { status: 404 });
    }

    if (grn.Status !== "QaPending") {
      return NextResponse.json({ success: false, message: `Only GRNs in QaPending status can be posted. Current status: ${grn.Status}.` }, { status: 400 });
    }

    const updatedGrn = await prisma.goodsReceipts.update({
      where: { GrnId: id },
      data: { Status: "Completed" }
    });

    // Typically here you would:
    // 1. Update PO Received Quantity
    // 2. Mark Delivery as Received
    // 3. Update Inventory Stock
    // For now we just update the GRN status.

    return NextResponse.json({ success: true, message: "GRN posted successfully.", data: updatedGrn });
  } catch (error: any) {
    console.error("Error posting GRN:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
