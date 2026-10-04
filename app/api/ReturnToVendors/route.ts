import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "All";

    const where: any = {};
    if (status !== "All") {
      where.Status = status;
    }

    const rtvs = await prisma.returnToVendors.findMany({
      where,
      orderBy: { CreatedAt: "desc" },
      include: {
        Discrepancies: { include: { GoodsReceipts: true, PurchaseOrders: { include: { PurchaseRequisition: true } } } },
        NonConformanceReports: { include: { QualityInspections: true } },
        Suppliers: true,
        Items: { include: { Uom: true, UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } }
      }
    });

    const data = rtvs.map(r => ({
      rtvId: r.RtvId,
      rtvNumber: r.RtvNumber,
      ncrId: r.NcrId,
      ncrNumber: r.NonConformanceReports?.NcrNumber,
      discrepancyId: r.Discrepancies[0]?.DiscrepancyId,
      discrepancyNumber: r.Discrepancies[0]?.DiscrepancyNumber,
      grnId: r.Discrepancies[0]?.GrnId,
      grnNumber: r.Discrepancies[0]?.GrnNumber,
      poId: r.Discrepancies[0]?.PoId,
      poNumber: r.Discrepancies[0]?.PoNumber,
      prId: r.Discrepancies[0]?.PurchaseOrders?.PrId,
      prNumber: r.Discrepancies[0]?.PurchaseOrders?.PurchaseRequisition?.PrNumber,
      supplierId: r.SupplierId,
      supplierName: r.Suppliers?.CompanyName || "",
      itemId: r.ItemId,
      itemName: r.Items?.ItemName || "",
      returnedQuantity: Number(r.ReturnedQuantity),
      quantityReturned: Number(r.ReturnedQuantity),
      uomName: r.Items?.Uom?.Abbreviation || r.Items?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "Unit",
      returnReason: r.Reason,
      status: r.Status,
      approvalRequestNotes: r.ApprovalRequestNotes,
      approvedBy: r.ApprovedBy,
      approvedAt: r.ApprovedAt,
      rejectedBy: r.RejectedBy,
      rejectedAt: r.RejectedAt,
      rejectionReason: r.RejectionReason,
      dispatchedDate: r.DispatchedDate,
      creditNoteNumber: r.CreditNoteNumber,
      createdBy: r.CreatedBy,
      createdAt: r.CreatedAt
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching ReturnToVendors:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
