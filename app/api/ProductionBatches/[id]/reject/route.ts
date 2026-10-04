import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    if (!body.reason || !String(body.reason).trim()) {
      return NextResponse.json({ success: false, message: "Rejection reason is required." }, { status: 400 });
    }

    const batch = await prisma.productionBatches.findUnique({ where: { BatchId: id } });
    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }
    if (batch.Status !== "Pending Approval") {
      return NextResponse.json(
        { success: false, message: `Batch cannot be rejected from status "${batch.Status}".` },
        { status: 400 }
      );
    }

    const updated = await prisma.productionBatches.update({
      where: { BatchId: id },
      data: {
        Status: "Rejected",
        RejectionReason: String(body.reason).trim(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Production batch rejected.",
      data: { batchId: updated.BatchId, status: updated.Status, rejectionReason: updated.RejectionReason },
    });
  } catch (error: any) {
    console.error("PUT /api/ProductionBatches/[id]/reject error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
