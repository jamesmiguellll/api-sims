import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const stockIn = await prisma.stockIns.findUnique({
      where: { StockInId: id },
    });

    if (!stockIn) {
      return NextResponse.json({ success: false, message: `Stock-In ${id} not found.` }, { status: 404 });
    }

    if (stockIn.Status !== "Draft") {
      return NextResponse.json({ success: false, message: `Only Stock-Ins in Draft status can be submitted. Current status: ${stockIn.Status}.` }, { status: 400 });
    }

    const updated = await prisma.stockIns.update({
      where: { StockInId: id },
      data: {
        Status: "PendingApproval",
        SubmittedBy: "System User",
        SubmittedAt: new Date(),
      }
    });

    return NextResponse.json({ success: true, data: updated, message: "Stock-In submitted successfully." });
  } catch (error: any) {
    console.error("Error submitting Stock-In:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
