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

    if (grn.Status !== "Draft") {
      return NextResponse.json({ success: false, message: `Only Draft GRNs can proceed to QA. Current status: ${grn.Status}.` }, { status: 400 });
    }

    const updatedGrn = await prisma.goodsReceipts.update({
      where: { GrnId: id },
      data: { Status: "QaPending" }
    });

    return NextResponse.json({ success: true, message: "GRN moved to QA Pending.", data: updatedGrn });
  } catch (error: any) {
    console.error("Error moving GRN to QA:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
