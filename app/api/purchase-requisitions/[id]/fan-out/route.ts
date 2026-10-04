import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const pr = await prisma.purchaseRequisitions.findUnique({
      where: { PrId: id },
      include: {
        PurchaseRequisitionItems: {
          include: { Items: true, SuggestedSuppliers: true, UnitOfMeasures: true }
        }
      }
    });

    if (!pr) {
      return NextResponse.json({ success: false, message: `Purchase requisition ${id} not found.` }, { status: 404 });
    }

    if (pr.Status !== "Approved") {
      return NextResponse.json({ success: false, message: `Only Approved requisitions can be converted to Purchase Orders. Current status: ${pr.Status}.` }, { status: 400 });
    }

    const supplierItemMap: Record<number, any[]> = {};

    for (const item of pr.PurchaseRequisitionItems) {
      let supplierId = null;

      if (item.SuggestedSupplierId && item.SuggestedSupplierId > 0) {
        supplierId = item.SuggestedSupplierId;
      } else {
        const preferred = await prisma.supplierItems.findFirst({
          where: { ItemId: item.ItemId, IsPreferred: true, IsActive: true }
        });

        if (preferred) {
          supplierId = preferred.SupplierId;
        } else {
          const anyVendor = await prisma.supplierItems.findFirst({
            where: { ItemId: item.ItemId, IsActive: true }
          });
          if (anyVendor) {
            supplierId = anyVendor.SupplierId;
          } else {
            return NextResponse.json({ success: false, message: `Item '${item.Items?.ItemName || item.ItemId}' has no registered supplier in catalog. Please specify a supplier.` }, { status: 400 });
          }
        }
      }

      if (!supplierItemMap[supplierId]) {
        supplierItemMap[supplierId] = [];
      }
      supplierItemMap[supplierId].push(item);
    }

    const generatedPos = [];
    const poNumbers = [];

    const year = new Date().getFullYear();

    for (const supplierIdStr of Object.keys(supplierItemMap)) {
      const supplierId = parseInt(supplierIdStr, 10);
      const items = supplierItemMap[supplierId];

      const expectedArrivalDate = pr.RequiredDate && pr.RequiredDate > new Date() ? pr.RequiredDate : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      
      const seq = await prisma.documentSequences.upsert({
        where: { DocType_Year: { DocType: "PurchaseOrder", Year: year } },
        update: { LastNumber: { increment: 1 } },
        create: { DocType: "PurchaseOrder", Year: year, LastNumber: 1 },
      });
      const poNumber = `PO-${year}-${String(seq.LastNumber).padStart(4, '0')}`;

      const poItems = items.map(i => ({
        ItemId: i.ItemId,
        SupplierId: supplierId,
        PoItemQuantity: i.RequestedQuantity,
        TotalPrice: Number(i.EstimatedUnitPrice) * Number(i.RequestedQuantity),
        PurchaseUomId: i.PurchaseUomId,
        ReceivedQuantity: 0
      }));

      const calculatedTotal = poItems.reduce((acc, item) => acc + item.TotalPrice, 0);

      const newOrder = await prisma.$transaction(async (tx) => {
        const created = await tx.purchaseOrders.create({
          data: {
            PoNumber: poNumber,
            PrId: pr.PrId,
            PurchaseRequisitionPrId: pr.PrId,
            SupplierId: supplierId,
            OrderDate: new Date(),
            ExpectedArrivalDate: expectedArrivalDate,
            Status: "Draft",
            PaymentType: "Terms 30 Days",
            ProofImageUrl: "",
            TotalAmount: calculatedTotal,
            RequestedBy: pr.RequestedBy || "System Generated",
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
            PurchaseOrderItems: { include: { Items: true, UnitOfMeasures: true } },
          },
        });
      });

      generatedPos.push({
        poId: newOrder.PoId,
        poNumber: newOrder.PoNumber,
        supplierName: newOrder.Suppliers?.CompanyName || "",
        totalAmount: Number(newOrder.TotalAmount)
      });
      poNumbers.push(newOrder.PoNumber);
    }

    await prisma.purchaseRequisitions.update({
      where: { PrId: id },
      data: {
        Status: "ConvertedToPO",
        UpdatedAt: new Date(),
        AdminNotes: `Converted to ${poNumbers.join(', ')}`
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Successfully generated ${generatedPos.length} Purchase Orders from PR.`, 
      data: { generatedPos } 
    });

  } catch (error: any) {
    console.error("Error fanning out PR to POs:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
