import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  return handleReject(request, props);
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  return handleReject(request, props);
}

async function handleReject(
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
    const reason = String(body.reason || "").trim();
    const assignedCook = String(body.assignedCook || "").trim();
    const proofImageUrl = String(body.proofImageUrl || "").trim();
    const rejectionDate = body.rejectionDate ? new Date(body.rejectionDate) : new Date();
    const notes = String(body.notes || "").trim();

    if (!reason) {
      return NextResponse.json(
        { success: false, message: "Rejection reason is required." },
        { status: 400 }
      );
    }

    const batch = await prisma.productionBatches.findUnique({
      where: { BatchId: id },
      include: {
        FinishedProducts: {
          include: { Items: true },
        },
        ProductionRequests: true,
        BatchConsumptions: {
          include: { Items: true },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    if (batch.Status === "Rejected") {
      return NextResponse.json(
        { success: false, message: "This batch has already been rejected." },
        { status: 400 }
      );
    }

    const now = new Date();
    const year = now.getFullYear();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");

    // Generate unique Loss Report sequence
    const docType = "LossReport_Production";
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: docType, Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: docType, Year: year, LastNumber: 1 },
    });
    const lossReportNumber = `LR-PRD-${dateStr}-${String(seq.LastNumber).padStart(4, "0")}`;

    // Item to log loss for (either finished product or primary ingredient)
    const itemId = batch.FinishedProducts?.ItemId || batch.ProductId;
    const uomId = batch.FinishedProducts?.Items?.UomId || 1;
    const lostQty = Number(batch.EstimatedQuantity) > 0 ? Number(batch.EstimatedQuantity) : 1;

    const fullReason = `Batch Rejected (${batch.BatchNumber}): ${reason}`;
    const fullNotes = `Cook: ${assignedCook || batch.AssignedCook || "Head Cook"}. ${notes ? `Notes: ${notes}. ` : ""}PR: ${batch.ProductionRequests?.ReqNumber || "N/A"}. Date: ${rejectionDate.toISOString()}`;

    // Transaction to update batch, update PR, and create LossReport
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Loss Report
      const lossReport = await tx.lossReports.create({
        data: {
          LossReportNumber: lossReportNumber,
          ItemId: itemId,
          UomId: uomId,
          LostQuantity: lostQty,
          Reason: fullReason,
          Notes: fullNotes,
          AuthorisedBy: "Head Cook",
          CreatedBy: assignedCook || batch.AssignedCook || "Head Cook",
          CreatedAt: now,
          IsAcknowledged: false,
        },
      });

      // 2. Update Production Batch
      const updatedBatch = await tx.productionBatches.update({
        where: { BatchId: id },
        data: {
          Status: "Rejected",
          RejectionReason: reason,
          AssignedCook: assignedCook || batch.AssignedCook,
          ImageUrl: proofImageUrl || batch.ImageUrl,
          Notes: batch.Notes
            ? `${batch.Notes}\n[REJECTED: ${reason} | Loss Report: ${lossReportNumber}]`
            : `[REJECTED: ${reason} | Loss Report: ${lossReportNumber}]`,
        },
      });

      // 3. Update linked Production Request
      if (batch.ProdReqId) {
        await tx.productionRequests.update({
          where: { ProdReqId: batch.ProdReqId },
          data: {
            Status: "Rejected",
            RejectionReason: reason,
            RejectedBy: assignedCook || batch.AssignedCook || "Head Cook",
            RejectedAt: now,
          },
        });
      }

      return { updatedBatch, lossReport };
    });

    return NextResponse.json({
      success: true,
      message: `Production batch rejected. Loss Report ${lossReportNumber} created in Loss & Disposal.`,
      data: {
        batchId: result.updatedBatch.BatchId,
        status: result.updatedBatch.Status,
        lossReportNumber: result.lossReport.LossReportNumber,
        lossReportId: result.lossReport.LossReportId,
      },
    });
  } catch (error: any) {
    console.error("Reject production batch error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
