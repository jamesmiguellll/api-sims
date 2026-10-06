import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BATCH_INCLUDE, mapBatch } from "../../route";

export const PRODUCTION_STAGES = [
  "Pre-Production",
  "Peeling",
  "Steaming",
  "Mixing/Grinding",
  "Cooking",
  "Cooling",
  "Packaging",
  "Completed",
] as const;

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const targetStage = body.stage;
    const notes = body.notes;

    if (!targetStage || !PRODUCTION_STAGES.includes(targetStage)) {
      return NextResponse.json({
        success: false,
        message: `Invalid stage. Must be one of: ${PRODUCTION_STAGES.join(", ")}`,
      }, { status: 400 });
    }

    const batch = await prisma.productionBatches.findUnique({
      where: { BatchId: id },
    });

    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    if (batch.Status === "Completed") {
      return NextResponse.json({ success: false, message: "This batch has already been completed." }, { status: 400 });
    }

    const updateData: any = {
      Stage: targetStage,
      CurrentStage: targetStage,
    };

    if (notes) {
      updateData.Notes = batch.Notes ? `${batch.Notes}\n[${targetStage}] ${notes}` : `[${targetStage}] ${notes}`;
    }

    const updated = await prisma.productionBatches.update({
      where: { BatchId: id },
      data: updateData,
      include: BATCH_INCLUDE,
    });

    return NextResponse.json({
      success: true,
      message: `Batch stage advanced to ${targetStage}.`,
      data: mapBatch(updated),
    });
  } catch (error: any) {
    console.error("PATCH /api/ProductionBatches/[id]/stage error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
