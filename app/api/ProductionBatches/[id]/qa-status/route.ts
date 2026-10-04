import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const batch = await prisma.productionBatches.findUnique({ where: { BatchId: id } });
    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    const isApproved = body.isApproved === true;
    const newStatus = isApproved ? "Passed QA" : "Failed QA";

    const updated = await prisma.productionBatches.update({
      where: { BatchId: id },
      data: {
        QualityStatus: isApproved ? "Passed" : "Failed",
        Status: newStatus,
        ...(body.rejectionReason && { RejectionReason: body.rejectionReason }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `QA status updated: ${newStatus}.`,
      data: { batchId: updated.BatchId, qualityStatus: updated.QualityStatus, status: updated.Status },
    });
  } catch (error: any) {
    console.error("PUT /api/ProductionBatches/[id]/qa-status error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
