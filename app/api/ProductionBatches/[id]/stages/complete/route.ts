import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const COOKING_STAGES = [
  "Steaming",
  "Peeling",
  "Grinding",
  "Mixing",
  "Cooking",
  "Cooling",
] as const;

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid batch ID." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const stage = String(body.stage || "").trim();
    const endTime = String(body.endTime || "").trim();
    const notes = String(body.notes || "").trim();
    const completedBy = String(body.completedBy || "Head Cook").trim();

    if (!stage || !COOKING_STAGES.includes(stage as any)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid stage. Must be one of: ${COOKING_STAGES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!endTime) {
      return NextResponse.json(
        { success: false, message: "End time is required to complete this stage." },
        { status: 400 }
      );
    }

    const batch = await prisma.productionBatches.findUnique({
      where: { BatchId: id },
    });

    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    if (batch.Status === "Rejected") {
      return NextResponse.json(
        { success: false, message: "Cannot advance a rejected batch." },
        { status: 400 }
      );
    }

    const stageIdx = COOKING_STAGES.indexOf(stage as any);
    const nextStage =
      stageIdx < COOKING_STAGES.length - 1
        ? COOKING_STAGES[stageIdx + 1]
        : "Packaging"; // After Cooling -> Packaging

    const logEntry = `[STAGE:${stage}|END:${endTime}|BY:${completedBy}${notes ? `|NOTES:${notes}` : ""}]`;
    const updatedNotes = batch.Notes ? `${batch.Notes}\n${logEntry}` : logEntry;

    const updated = await prisma.productionBatches.update({
      where: { BatchId: id },
      data: {
        CurrentStage: nextStage,
        Stage: nextStage,
        Notes: updatedNotes,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Stage ${stage} completed successfully! Next stage: ${nextStage}`,
      data: {
        batchId: updated.BatchId,
        currentStage: updated.CurrentStage,
        stage: updated.Stage,
        notes: updated.Notes,
      },
    });
  } catch (error: any) {
    console.error("POST /api/ProductionBatches/[id]/stages/complete error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
