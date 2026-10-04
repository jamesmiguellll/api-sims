import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "All";
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));
    const eligibleForDelivery = searchParams.get("eligibleForDelivery") === "true";

    const where: any = {};
    
    if (status !== "All") {
      where.Status = status;
    }
    
    if (search) {
      where.OR = [
        { PoNumber: { contains: search, mode: "insensitive" } },
        { Suppliers: { CompanyName: { contains: search, mode: "insensitive" } } },
      ];
    }
    
    if (eligibleForDelivery) {
      where.Status = { in: ["Approved", "PartiallyDelivered"] };
    }

    const totalCount = await prisma.purchaseOrders.count({ where });

    const pos = await prisma.purchaseOrders.findMany({
      where,
      orderBy: { OrderDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        Suppliers: true,
        PurchaseRequisition: true,
        PurchaseOrderItems: {
          include: {
            Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } },
            UnitOfMeasures: true
          }
        }
      }
    });

    const data = pos.map(po => ({
      poId: po.PoId,
      prId: po.PrId,
      prNumber: po.PurchaseRequisition?.PrNumber,
      supplierId: po.SupplierId,
      supplierName: po.Suppliers?.CompanyName || "",
      orderDate: po.OrderDate,
      poNumber: po.PoNumber,
      expectedArrivalDate: po.ExpectedArrivalDate,
      status: po.Status,
      paymentType: po.PaymentType,
      totalAmount: Number(po.TotalAmount),
      requestedBy: po.RequestedBy,
      adminNotes: po.AdminNotes,
      qaNotes: po.QaNotes,
      qaInspectedDate: po.QaInspectedDate,
      qaStatus: po.QaStatus,
      inspectedBy: po.InspectedBy,
      items: po.PurchaseOrderItems.map(i => ({
        poItemId: i.PoItemId,
        itemId: i.ItemId,
        itemName: i.Items?.ItemName || "",
        poItemQuantity: Number(i.PoItemQuantity),
        receivedQuantity: Number(i.ReceivedQuantity),
        totalPrice: Number(i.TotalPrice),
        purchaseUomId: i.PurchaseUomId,
        purchaseUomName: i.UnitOfMeasures?.Abbreviation || i.Items?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "Unit"
      }))
    }));

    return NextResponse.json({ success: true, data: { items: data, totalCount, page, pageSize } });
  } catch (error: any) {
    console.error("Error fetching POs:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const supplier = await prisma.suppliers.findUnique({ where: { SupplierId: body.supplierId } });
    if (!supplier) {
      return NextResponse.json({ success: false, message: `Supplier with ID ${body.supplierId} not found.` }, { status: 400 });
    }

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ success: false, message: "Purchase order must contain at least one item." }, { status: 400 });
    }

    let expectedArrivalDate = body.expectedArrivalDate ? new Date(body.expectedArrivalDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (expectedArrivalDate <= new Date()) {
      expectedArrivalDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const poItems: Array<{
      ItemId: number;
      SupplierId: number;
      PoItemQuantity: number;
      TotalPrice: number;
      PurchaseUomId: number;
      ReceivedQuantity: number;
    }> = [];
    for (const itemReq of body.items) {
      if (itemReq.poItemQuantity <= 0) {
        return NextResponse.json({ success: false, message: "Quantity must be greater than zero." }, { status: 400 });
      }

      const item = await prisma.items.findUnique({ where: { ItemId: itemReq.itemId } });
      if (!item) {
        return NextResponse.json({ success: false, message: `Item with ID ${itemReq.itemId} not found.` }, { status: 400 });
      }

      const catalogEntry = await prisma.supplierItems.findFirst({
        where: { SupplierId: body.supplierId, ItemId: itemReq.itemId }
      });
      if (!catalogEntry) {
        return NextResponse.json({ success: false, message: `No supplier price is configured for '${item.ItemName}'.` }, { status: 400 });
      }
      if (Number(catalogEntry.UnitPrice) <= 0) {
        return NextResponse.json({ success: false, message: `Supplier price for '${item.ItemName}' must be greater than zero.` }, { status: 400 });
      }

      let purchaseUomId = itemReq.purchaseUomId ?? catalogEntry.PurchaseUomId;
      if (!purchaseUomId || purchaseUomId <= 0) {
        purchaseUomId = item.StockUomId;
      }

      poItems.push({
        ItemId: itemReq.itemId,
        SupplierId: body.supplierId,
        PoItemQuantity: itemReq.poItemQuantity,
        TotalPrice: Number(catalogEntry.UnitPrice) * Number(itemReq.poItemQuantity),
        PurchaseUomId: purchaseUomId,
        ReceivedQuantity: 0
      });
    }

    const calculatedTotal = poItems.reduce((acc, item) => acc + item.TotalPrice, 0);

    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "PurchaseOrder", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "PurchaseOrder", Year: year, LastNumber: 1 },
    });
    const poNumber = `PO-${year}-${String(seq.LastNumber).padStart(4, '0')}`;

    let initialStatus = "Draft";
    if (body.initialStatus && body.initialStatus !== "Unspecified") {
      initialStatus = body.initialStatus;
    }

    const newOrder = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrders.create({
        data: {
          PoNumber: poNumber,
          PrId: body.prId || null,
          PurchaseRequisitionPrId: body.prId || null,
          SupplierId: body.supplierId,
          OrderDate: new Date(),
          ExpectedArrivalDate: expectedArrivalDate,
          Status: initialStatus,
          PaymentType: body.paymentType || "Cash",
          ProofImageUrl: "",
          TotalAmount: calculatedTotal,
          RequestedBy: body.requestedBy || "",
        },
      });

      await tx.purchaseOrderItems.createMany({
        data: poItems.map((item) => ({
          ...item,
          PoId: created.PoId,
          PurchaseOrderPoId: created.PoId,
        })),
      });

      return tx.purchaseOrders.findUniqueOrThrow({
        where: { PoId: created.PoId },
        include: {
          Suppliers: true,
          PurchaseRequisition: true,
          PurchaseOrderItems: {
            include: {
              Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } },
              UnitOfMeasures: true,
            },
          },
        },
      });
    });

    const response = {
      poId: newOrder.PoId,
      prId: newOrder.PrId,
      prNumber: newOrder.PurchaseRequisition?.PrNumber,
      supplierId: newOrder.SupplierId,
      supplierName: newOrder.Suppliers?.CompanyName || "",
      orderDate: newOrder.OrderDate,
      poNumber: newOrder.PoNumber,
      expectedArrivalDate: newOrder.ExpectedArrivalDate,
      status: newOrder.Status,
      paymentType: newOrder.PaymentType,
      totalAmount: Number(newOrder.TotalAmount),
      requestedBy: newOrder.RequestedBy,
      adminNotes: newOrder.AdminNotes,
      qaNotes: newOrder.QaNotes,
      qaInspectedDate: newOrder.QaInspectedDate,
      qaStatus: newOrder.QaStatus,
      inspectedBy: newOrder.InspectedBy,
      items: newOrder.PurchaseOrderItems.map(i => ({
        poItemId: i.PoItemId,
        itemId: i.ItemId,
        itemName: i.Items?.ItemName || "",
        poItemQuantity: Number(i.PoItemQuantity),
        receivedQuantity: Number(i.ReceivedQuantity),
        totalPrice: Number(i.TotalPrice),
        purchaseUomId: i.PurchaseUomId,
        purchaseUomName: i.UnitOfMeasures?.Abbreviation || i.Items?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures?.Abbreviation || "Unit"
      }))
    };

    return NextResponse.json({ success: true, message: "Purchase order created successfully", data: response });
  } catch (error: any) {
    console.error("Error creating purchase order:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
