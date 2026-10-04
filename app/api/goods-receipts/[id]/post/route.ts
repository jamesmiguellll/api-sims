import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const grn = await prisma.goodsReceipts.findUnique({
      where: { GrnId: id },
      include: {
        GoodsReceiptItems: true
      }
    });

    if (!grn) {
      return NextResponse.json({ success: false, message: `Goods Receipt Note ${id} not found.` }, { status: 404 });
    }

    if (grn.Status !== "Draft") {
      return NextResponse.json({ success: false, message: `Only GRNs in Draft status can be posted for QA. Current status: ${grn.Status}.` }, { status: 400 });
    }

    const updatedGrn = await prisma.$transaction(async (tx) => {
      // 1. Advance GRN status to QaPending
      const result = await tx.goodsReceipts.update({
        where: { GrnId: id },
        data: { Status: "QaPending" }
      });

      // 2. Automatically generate a QA Inspection
      const year = new Date().getFullYear();
      
      // Get max inspection number
      const maxQc = await tx.qualityInspections.findFirst({
        orderBy: { InspectionId: "desc" },
      });
      let nextSeq = 1;
      if (maxQc && maxQc.InspectionNumber) {
        const match = maxQc.InspectionNumber.match(/QC-\d{4}-(\d+)/);
        if (match) {
          nextSeq = parseInt(match[1], 10) + 1;
        }
      }
      const inspectionNumber = `QC-${year}-${String(nextSeq).padStart(4, "0")}`;

      await tx.qualityInspections.create({
        data: {
          InspectionNumber: inspectionNumber,
          InspectionType: "Receiving",
          ReferenceType: "GRN",
          ReferenceId: grn.GrnId,
          ReferenceNumber: grn.GrnNumber,
          InspectorId: "SYS",
          InspectorName: "Pending QA",
          InspectionDate: new Date(),
          Status: "Pending",
          QualityInspectionItems: {
            create: grn.GoodsReceiptItems.map((item) => ({
              ItemId: item.ItemId,
              DeliveredQuantity: item.DeliveredQuantity,
              AcceptedQuantity: 0,
              RejectedQuantity: 0,
              ConcessionQuantity: 0,
            }))
          }
        }
      });

      return result;
    });

    return NextResponse.json({ success: true, message: "GRN posted and QA inspection generated successfully.", data: updatedGrn });
  } catch (error: any) {
    console.error("Error posting GRN:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
