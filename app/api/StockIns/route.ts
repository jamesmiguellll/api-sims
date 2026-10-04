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

    const stockIns = await prisma.stockIns.findMany({
      where,
      orderBy: { CreatedAt: "desc" },
      include: {
        StockInLines: {
          include: {
            Items: { include: { Category: true } },
            UnitOfMeasures: true
          }
        },
        GoodsReceipts: {
          include: {
            Deliveries: {
              include: {
                PurchaseOrders: { include: { Suppliers: true } }
              }
            }
          }
        }
      }
    });

    const data = stockIns.map((s: typeof stockIns[number]) => ({
      stockInId: s.StockInId,
      stockInNumber: s.StockInNumber,
      grnId: s.GrnId,
      grnNumber: s.GoodsReceipts?.GrnNumber || "",
      supplierId: s.GoodsReceipts?.Deliveries?.PurchaseOrders?.SupplierId || 0,
      supplierName: s.GoodsReceipts?.Deliveries?.PurchaseOrders?.Suppliers?.CompanyName || "",
      poNumber: s.GoodsReceipts?.Deliveries?.PurchaseOrders?.PoNumber || "",
      status: s.Status,
      createdBy: s.CreatedBy,
      createdAt: s.CreatedAt,
      submittedBy: s.SubmittedBy,
      submittedAt: s.SubmittedAt,
      approvedBy: s.ApprovedBy,
      approvedAt: s.ApprovedAt,
      rejectedBy: s.RejectedBy,
      rejectedAt: s.RejectedAt,
      rejectionReason: s.RejectionReason,
      committedBy: s.CommittedBy,
      committedAt: s.CommittedAt,
      notes: s.Notes,
      lines: s.StockInLines.map((l: typeof s.StockInLines[number]) => ({
        stockInLineId: l.StockInLineId,
        stockInId: l.StockInId,
        grnItemId: l.GrnItemId,
        itemId: l.ItemId,
        itemName: l.Items?.ItemName || "",
        itemCode: l.Items?.ItemCode || "",
        categoryName: l.Items?.Category?.CategoryName || "",
        purchaseUomId: l.PurchaseUomId,
        purchaseUomName: l.UnitOfMeasures?.Abbreviation || "Unit",
        quantityToStock: Number(l.QuantityToStock),
        currentStockBeforeCommit: Number(l.CurrentStockBeforeCommit),
        lotCode: l.LotCode,
        expiryDate: l.ExpiryDate,
        committedToInventory: l.CommittedToInventory,
        inventoryLotId: l.InventoryLotId,
        notes: l.Notes
      }))
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching StockIns:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
