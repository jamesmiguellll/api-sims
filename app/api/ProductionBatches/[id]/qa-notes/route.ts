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

    const updated = await prisma.productionBatches.update({
      where: { BatchId: id },
      data: {
        Notes: body.notes ?? batch.Notes,
      },
    });

    return NextResponse.json({
      success: true,
      message: "QA notes updated.",
      data: { batchId: updated.BatchId, notes: updated.Notes },
    });
  } catch (error: any) {
    console.error("PUT /api/ProductionBatches/[id]/qa-notes error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
