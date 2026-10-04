import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const batch = await prisma.productionBatches.findUnique({ where: { BatchId: id } });
    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }
    if (batch.Status !== "Pending Approval") {
      return NextResponse.json(
        { success: false, message: `Batch cannot be approved from status "${batch.Status}".` },
        { status: 400 }
      );
    }

    const updated = await prisma.productionBatches.update({
      where: { BatchId: id },
      data: { Status: "Approved" },
    });

    return NextResponse.json({ success: true, message: "Production batch approved.", data: { batchId: updated.BatchId, status: updated.Status } });
  } catch (error: any) {
    console.error("PUT /api/ProductionBatches/[id]/approve error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
