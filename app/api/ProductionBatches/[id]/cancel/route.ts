import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CANCELLABLE = ["Pending Approval", "Approved", "In Progress"];

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const batch = await prisma.productionBatches.findUnique({ where: { BatchId: id } });
    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }
    if (!CANCELLABLE.includes(batch.Status)) {
      return NextResponse.json(
        { success: false, message: `Batch with status "${batch.Status}" cannot be cancelled.` },
        { status: 400 }
      );
    }

    const updated = await prisma.productionBatches.update({
      where: { BatchId: id },
      data: { Status: "Cancelled" },
    });

    return NextResponse.json({ success: true, message: "Batch cancelled.", data: { batchId: updated.BatchId, status: updated.Status } });
  } catch (error: any) {
    console.error("PUT /api/ProductionBatches/[id]/cancel error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
