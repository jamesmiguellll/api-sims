import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending"; // "pending" | "completed" | "all"

    // Batches in "For QA", "For Stock-in", or "Stocked In"
    const where: any = {};
    if (status === "pending") {
      where.Status = "For QA";
    } else if (status === "completed") {
      where.Status = { in: ["For Stock-in", "Stocked In", "Completed"] };
    } else {
      where.Status = { in: ["For QA", "For Stock-in", "Stocked In", "Completed"] };
    }

    const batches = await prisma.productionBatches.findMany({
      where,
      include: {
        FinishedProducts: {
          include: { Items: true },
        },
        InventoryLots: true,
        ProductionRequests: true,
        BatchConsumptions: {
          include: {
            Items: true,
            UnitOfMeasures: true,
            InventoryLots: true,
          },
        },
      },
      orderBy: { BatchId: "desc" },
    });

    const mapped = batches.map((b) => ({
      batchId: b.BatchId,
      batchNumber: b.BatchNumber,
      prodReqId: b.ProdReqId,
      reqNumber: b.ProductionRequests?.ReqNumber ?? "",
      requestedBy: b.ProductionRequests?.RequestedBy ?? "",
      approvedBy: b.ProductionRequests?.ApprovedBy ?? "",
      productId: b.ProductId,
      productName: b.FinishedProducts?.Items?.ItemName ?? "",
      productCode: b.FinishedProducts?.Items?.ItemCode ?? "",
      variant: b.FinishedProducts?.Variant ?? "",
      fgLotId: b.FgLotId,
      fgLotCode: b.InventoryLots?.LotCode ?? "",
      mfgDate: b.PackagedAt ? b.PackagedAt.toISOString() : b.ProductionDate.toISOString(),
      expiryDate: b.ExpiryDate ? b.ExpiryDate.toISOString() : null,
      requestQty: Number(b.ProductionRequests?.Quantity ?? b.EstimatedQuantity),
      packedQty: Number(b.FinalQuantity ?? b.ActualQuantity),
      yieldPercentage: Number(b.YieldPercentage),
      status: b.Status,
      qualityStatus: b.QualityStatus,
      imageUrl: b.ImageUrl ?? "",
      packagedBy: b.PackagedBy ?? "",
      materials: (b.BatchConsumptions ?? []).map((c) => ({
        itemName: c.Items?.ItemName ?? "",
        quantity: Number(c.QuantityUsed),
        uom: c.UnitOfMeasures?.Abbreviation ?? "",
      })),
    }));

    return NextResponse.json({ success: true, data: mapped });
  } catch (error: any) {
    console.error("GET /api/production-qa error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const batchId = parseInt(body.batchId, 10);
    const acceptedQuantity = Number(body.acceptedQuantity ?? 0);
    const acceptedReason = String(body.acceptedReason || "").trim();
    const rejectedQuantity = Number(body.rejectedQuantity ?? 0);
    const rejectedReason = String(body.rejectedReason || "").trim();
    const inspectorName = String(body.inspectorName || "Ramon Dela Cruz").trim();
    const remarks = String(body.remarks || "").trim();
    const checklist = body.checklist || {};

    if (isNaN(batchId)) {
      return NextResponse.json({ success: false, message: "Valid batchId is required." }, { status: 400 });
    }

    const batch = await prisma.productionBatches.findUnique({
      where: { BatchId: batchId },
      include: {
        FinishedProducts: {
          include: { Items: true },
        },
        InventoryLots: true,
        ProductionRequests: true,
      },
    });

    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    if (batch.Status !== "For QA") {
      return NextResponse.json(
        { success: false, message: `Batch status is '${batch.Status}', cannot perform QA.` },
        { status: 400 }
      );
    }

    const totalPacked = Number(batch.FinalQuantity || batch.ActualQuantity);
    if (acceptedQuantity + rejectedQuantity !== totalPacked) {
      return NextResponse.json(
        {
          success: false,
          message: `Accepted quantity (${acceptedQuantity}) + Rejected quantity (${rejectedQuantity}) must equal total packed quantity (${totalPacked}).`,
        },
        { status: 400 }
      );
    }

    if (acceptedQuantity > 0 && !acceptedReason) {
      return NextResponse.json(
        { success: false, message: "Reason for accepted units is required." },
        { status: 400 }
      );
    }

    if (rejectedQuantity > 0 && !rejectedReason) {
      return NextResponse.json(
        { success: false, message: "Reason for rejected units is required." },
        { status: 400 }
      );
    }

    const now = new Date();
    const year = now.getFullYear();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");

    // 1. Generate unique Production QA sequence: PQA-YYMMDD-XXX
    const docType = "PQA_Inspection";
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: docType, Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: docType, Year: year, LastNumber: 1 },
    });
    const pqaNumber = `PQA-${dateStr.slice(2)}-${String(seq.LastNumber).padStart(3, "0")}`;

    const qaStatus =
      rejectedQuantity === 0 ? "Passed" : acceptedQuantity === 0 ? "Rejected" : "Partial Pass";

    const nextBatchStatus = acceptedQuantity > 0 ? "For Stock-in" : "Rejected";

    const result = await prisma.$transaction(async (tx) => {
      // 2. If rejected units exist, automatically create Loss Report
      let lossReportNumber: string | null = null;
      if (rejectedQuantity > 0) {
        const lossSeq = await tx.documentSequences.upsert({
          where: { DocType_Year: { DocType: "LossReport_QA", Year: year } },
          update: { LastNumber: { increment: 1 } },
          create: { DocType: "LossReport_QA", Year: year, LastNumber: 1 },
        });
        lossReportNumber = `LR-QA-${dateStr}-${String(lossSeq.LastNumber).padStart(4, "0")}`;

        await tx.lossReports.create({
          data: {
            LossReportNumber: lossReportNumber,
            ItemId: batch.FinishedProducts?.ItemId || batch.ProductId,
            UomId: batch.FinishedProducts?.Items?.UomId || 1,
            LostQuantity: rejectedQuantity,
            Reason: `QA Inspection Rejected: ${rejectedReason}`,
            Notes: `PQA: ${pqaNumber}. Batch: ${batch.BatchNumber}. Lot: ${batch.InventoryLots?.LotCode || "N/A"}. Inspector: ${inspectorName}`,
            AuthorisedBy: "QA Officer",
            CreatedBy: inspectorName,
            CreatedAt: now,
            IsAcknowledged: false,
          },
        });
      }

      // 3. Create QualityInspections record
      const inspection = await tx.qualityInspections.create({
        data: {
          InspectionNumber: pqaNumber,
          InspectionType: "Production",
          ReferenceType: "ProductionBatch",
          ReferenceId: batch.BatchId,
          ReferenceNumber: batch.BatchNumber,
          InspectorId: "qa-officer",
          InspectorName: inspectorName,
          InspectionDate: now,
          Status: qaStatus,
          TotalReceivedQuantity: totalPacked,
          TotalAcceptedQuantity: acceptedQuantity,
          TotalRejectedQuantity: rejectedQuantity,
          OverallNotes: JSON.stringify({
            acceptedReason,
            rejectedReason,
            remarks,
            checklist,
            lossReportNumber,
          }),
          CompletedAt: now,
          CompletedBy: inspectorName,
        },
      });

      // 4. Update Production Batches
      const activityLog = `[ACTIVITY:${now.toISOString()}|TITLE:QA review completed (${qaStatus}): ${acceptedQuantity} accepted, ${rejectedQuantity} rejected|ACTOR:${inspectorName}]`;
      const updatedNotes = batch.Notes ? `${batch.Notes}\n${activityLog}` : activityLog;

      const updatedBatch = await tx.productionBatches.update({
        where: { BatchId: batch.BatchId },
        data: {
          QualityStatus: qaStatus,
          Status: nextBatchStatus,
          CurrentStage: nextBatchStatus,
          Notes: updatedNotes,
        },
      });

      // 5. Update linked Production Request
      if (batch.ProdReqId) {
        await tx.productionRequests.update({
          where: { ProdReqId: batch.ProdReqId },
          data: {
            Status: nextBatchStatus,
            UpdatedAt: now,
          },
        });
      }

      return { updatedBatch, inspection, lossReportNumber };
    });

    return NextResponse.json({
      success: true,
      message: `QA Review completed (${qaStatus}) under ${pqaNumber}!`,
      data: {
        pqaNumber,
        status: qaStatus,
        nextStatus: nextBatchStatus,
        lossReportNumber: result.lossReportNumber,
      },
    });
  } catch (error: any) {
    console.error("POST /api/production-qa error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
