import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ type: string }> }) {
  const params = await props.params;
  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    
    let dateFilter: any = {};
    if (startDateParam && endDateParam) {
      dateFilter = {
        gte: new Date(startDateParam + "T00:00:00.000Z"),
        lte: new Date(endDateParam + "T23:59:59.999Z"),
      };
    } else if (startDateParam) {
      dateFilter = {
        gte: new Date(startDateParam + "T00:00:00.000Z"),
      };
    } else if (endDateParam) {
      dateFilter = {
        lte: new Date(endDateParam + "T23:59:59.999Z"),
      };
    }

    const type = params.type.toLowerCase();

    if (type === "inventory") {
      const inventories = await prisma.inventories.findMany({
        include: {
          Items: {
            include: { Category: true },
          },
        },
      });

      const aggregated = new Map<number, any>();
      inventories.forEach(inv => {
        const item = inv.Items;
        if (!aggregated.has(item.ItemId)) {
          aggregated.set(item.ItemId, {
            itemId: item.ItemId,
            itemName: item.ItemName,
            category: item.Category?.CategoryName || "",
            currentStock: 0,
            minReorderPoint: Number(item.MinStockLevel),
            status: item.IsActive ? "Active" : "Inactive",
          });
        }
        aggregated.get(item.ItemId).currentStock += Number(inv.CurrentStock);
      });

      return NextResponse.json({
        success: true,
        data: {
          inventoryLevels: Array.from(aggregated.values()),
        },
      });
    }

    if (type === "procurement") {
      let where: any = {};
      if (Object.keys(dateFilter).length > 0) {
        where.OrderDate = dateFilter;
      }
      const orders = await prisma.purchaseOrders.findMany({
        where,
        include: { Suppliers: true },
        orderBy: { OrderDate: 'desc' },
      });

      return NextResponse.json({
        success: true,
        data: {
          orders: orders.map(po => ({
            poId: po.PoId,
            supplierName: po.Suppliers?.CompanyName || "",
            orderDate: po.OrderDate ? po.OrderDate.toISOString().split("T")[0] : "",
            expectedArrivalDate: po.ExpectedArrivalDate ? po.ExpectedArrivalDate.toISOString().split("T")[0] : "",
            status: po.Status,
            totalAmount: Number(po.TotalAmount),
          })),
        },
      });
    }

    if (type === "production") {
      let where: any = {};
      if (Object.keys(dateFilter).length > 0) {
        where.ProductionDate = dateFilter;
      }
      const batches = await prisma.productionBatches.findMany({
        where,
        include: { FinishedProducts: { include: { Items: true } } },
        orderBy: { ProductionDate: 'desc' },
      });

      return NextResponse.json({
        success: true,
        data: {
          batches: batches.map(b => ({
            batchId: b.BatchId,
            productName: b.FinishedProducts?.Items?.ItemName || "",
            batchMultiplier: Number(b.BatchMultiplier || 1),
            estimatedQuantity: Number(b.EstimatedQuantity || 0),
            actualQuantity: Number(b.ActualQuantity || 0),
            productionDate: b.ProductionDate ? b.ProductionDate.toISOString().split("T")[0] : "",
            stage: b.Stage || "",
            status: b.Status,
          })),
        },
      });
    }

    if (type === "supplier") {
      // Basic scorecard implementation
      const suppliers = await prisma.suppliers.findMany({
        where: { IsActive: true },
        include: { PurchaseOrders: true },
      });

      return NextResponse.json({
        success: true,
        data: {
          vendorScorecard: suppliers.map(s => {
            const totalOrders = s.PurchaseOrders.length;
            const completed = s.PurchaseOrders.filter(po => po.Status === "Completed").length;
            const fulfillmentRate = totalOrders > 0 ? Math.round((completed / totalOrders) * 100) + "%" : "100%";
            return {
              supplierId: s.SupplierId,
              supplierName: s.CompanyName,
              totalOrders,
              onTimeRate: "100%", // Mocked for now
              fulfillmentRate,
              qualityPassRate: "100%", // Mocked for now
            };
          }),
        },
      });
    }

    if (type === "distribution") {
      let where: any = {};
      if (Object.keys(dateFilter).length > 0) {
        where.TransferDate = dateFilter;
      }
      const transfers = await prisma.stockTransfers.findMany({
        where,
        include: {
          FinishedProducts: { include: { Items: true } },
          Locations_StockTransfers_SourceLocationIdToLocations: true,
          Locations_StockTransfers_DestLocationIdToLocations: true,
        },
        orderBy: { TransferDate: 'desc' },
      });

      return NextResponse.json({
        success: true,
        data: {
          stockTransfers: transfers.map(t => ({
            transferId: t.TransferId,
            productName: t.FinishedProducts?.Items?.ItemName || "",
            transferQuantity: Number(t.TransferQuantity),
            sourceLocationName: t.Locations_StockTransfers_SourceLocationIdToLocations?.LocationName || "",
            destLocationName: t.Locations_StockTransfers_DestLocationIdToLocations?.LocationName || "",
            status: t.Status,
            transferDate: t.TransferDate ? t.TransferDate.toISOString().split("T")[0] : "",
          })),
        },
      });
    }

    return NextResponse.json({ success: false, message: "Unknown report type" }, { status: 400 });
  } catch (error: any) {
    console.error(`GET /api/reports error:`, error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
