import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const existingInspection = await prisma.qualityInspections.findUnique({
      where: { InspectionId: id },
    });

    if (!existingInspection) {
      return NextResponse.json({ success: false, message: "QA inspection not found." }, { status: 404 });
    }

    const updatedInspection = await prisma.$transaction(async (tx: any) => {
      // 1. Update main inspection record
      const inspection = await tx.qualityInspections.update({
        where: { InspectionId: id },
        data: {
          Status: "Completed",
          CompletedAt: new Date(),
          OverallNotes: body.overallNotes || existingInspection.OverallNotes,
        },
      });

      // 2. Update each item
      if (Array.isArray(body.items)) {
        for (const item of body.items) {
          if (item.inspectionItemId) {
            await tx.qualityInspectionItems.update({
              where: { InspectionItemId: item.inspectionItemId },
              data: {
                AcceptedQuantity: item.acceptedQuantity ?? 0,
                RejectedQuantity: item.rejectedQuantity ?? 0,
                ConcessionQuantity: item.concessionQuantity ?? 0,
                DefectReason: item.defectReason || null,
                Notes: item.notes || null,
              },
            });
          }
        }
      }

      return inspection;
    });

    return NextResponse.json({ success: true, data: updatedInspection, message: "QA inspection completed successfully." });
  } catch (error: any) {
    console.error("Error completing QA inspection:", error);
    return NextResponse.json({ success: false, message: "Failed to complete QA inspection." }, { status: 500 });
  }
}
