import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all";

    const where: any = {};
    if (filter === "unacknowledged") {
      where.IsAcknowledged = false;
    } else if (filter === "acknowledged") {
      where.IsAcknowledged = true;
    }

    const lossReports = await prisma.lossReports.findMany({
      where,
      orderBy: { CreatedAt: "desc" },
      include: {
        Discrepancies: { include: { GoodsReceipts: true, PurchaseOrders: { include: { Suppliers: true, PurchaseRequisition: true } } } },
        GoodsReceipts: { include: { Deliveries: { include: { PurchaseOrders: { include: { Suppliers: true, PurchaseRequisition: true } } } } } },
        Items: { include: { Uom: true, UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } }
      }
    });

    const data = lossReports.map((l: typeof lossReports[number]) => {
      // Find PO details from either Discrepancies or GoodsReceipts relations
      let poNumber = l.Discrepancies?.PoNumber;
      let prId = l.Discrepancies?.PurchaseOrders?.PrId;
      let prNumber = l.Discrepancies?.PurchaseOrders?.PurchaseRequisition?.PrNumber;
      let supplierName = l.Discrepancies?.PurchaseOrders?.Suppliers?.CompanyName;

      if (!poNumber && l.GoodsReceipts) {
        poNumber = l.GoodsReceipts.Deliveries?.PurchaseOrders?.PoNumber;
        prId = l.GoodsReceipts.Deliveries?.PurchaseOrders?.PrId;
        prNumber = l.GoodsReceipts.Deliveries?.PurchaseOrders?.PurchaseRequisition?.PrNumber;
        supplierName = l.GoodsReceipts.Deliveries?.PurchaseOrders?.Suppliers?.CompanyName;
      }

      return {
        lossReportId: l.LossReportId,
        lossReportNumber: l.LossReportNumber,
        discrepancyId: l.DiscrepancyId,
        discrepancyNumber: l.Discrepancies?.DiscrepancyNumber,
        grnId: l.GrnId,
        grnNumber: l.GoodsReceipts?.GrnNumber || l.Discrepancies?.GrnNumber,
        poId: l.PoId || l.Discrepancies?.PoId || l.GoodsReceipts?.PoId,
        poNumber: poNumber || "",
        prId: prId,
        prNumber: prNumber || "",
        supplierName: supplierName || "",
        itemId: l.ItemId,
        itemName: l.Items?.ItemName || "",
        itemCode: l.Items?.ItemCode || "",
        lostQuantity: Number(l.LostQuantity),
        uomId: l.UomId,
        uomName: l.Items?.Uom?.Abbreviation || l.Items?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "Unit",
        unitCost: 0, // Simplified for now
        totalCost: 0, // Simplified for now
        reason: l.Reason,
        notes: l.Notes,
        isAcknowledged: l.IsAcknowledged,
        acknowledgedBy: l.AcknowledgedBy,
        acknowledgedAt: l.AcknowledgedAt,
        authorisedBy: l.AuthorisedBy,
        createdBy: l.CreatedBy,
        createdAt: l.CreatedAt,
        stockLedgerEntryId: l.StockLedgerEntryId ? Number(l.StockLedgerEntryId) : undefined
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching LossReports:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
