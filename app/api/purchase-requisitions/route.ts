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

    const prs = await prisma.purchaseRequisitions.findMany({
      where,
      orderBy: { PrId: "desc" },
      include: {
        PurchaseRequisitionItems: {
          include: {
            Items: { include: { Inventories: true } },
            SuggestedSuppliers: true,
            UnitOfMeasures: true
          }
        }
      }
    });

    const data = prs.map(pr => ({
      prId: pr.PrId,
      prNumber: pr.PrNumber,
      department: pr.Department,
      requestedBy: pr.RequestedBy,
      requestDate: pr.RequestDate,
      requiredDate: pr.RequiredDate,
      status: pr.Status === 'PendingApproval' ? 'Pending Approval' : (pr.Status === 'ConvertedToPO' ? 'Converted to PO' : pr.Status),
      requestType: pr.RequestType,
      priority: pr.Priority,
      purpose: pr.Purpose,
      notes: pr.Notes,
      estimatedTotalAmount: Number(pr.EstimatedTotalAmount),
      updatedAt: pr.UpdatedAt,
      items: pr.PurchaseRequisitionItems.map(i => {
        const stockQty = i.Items?.Inventories?.reduce((acc, inv) => acc + Number(inv.CurrentStock), 0) || 0;
        return {
          prItemId: i.PrItemId,
          itemId: i.ItemId,
          itemName: i.Items?.ItemName || "",
          suggestedSupplierId: i.SuggestedSupplierId,
          suggestedSupplierName: i.SuggestedSuppliers?.CompanyName || "",
          requestedQuantity: Number(i.RequestedQuantity),
          purchaseUomId: i.PurchaseUomId,
          purchaseUomAbbreviation: i.UnitOfMeasures?.Abbreviation || "",
          estimatedUnitPrice: Number(i.EstimatedUnitPrice),
          totalEstimatedValue: Number(i.RequestedQuantity) * Number(i.EstimatedUnitPrice),
          currentStockInfo: `${stockQty} available`
        };
      })
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching purchase requisitions:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ success: false, message: "Requisition must contain at least one item." }, { status: 400 });
    }

    const itemIds = body.items.map((i: any) => i.itemId);
    const uniqueIds = new Set(itemIds);
    if (uniqueIds.size !== itemIds.length) {
      return NextResponse.json({ success: false, message: "Duplicate ingredient detected. Please consolidate duplicate lines before proceeding." }, { status: 400 });
    }

    const reqDateNow = new Date();
    const estTotal = body.items.reduce((acc: number, i: any) => acc + (Number(i.requestedQuantity) * Number(i.estimatedUnitPrice || 0)), 0);
    const initialStatus = body.submitForApproval ? "PendingApproval" : "Draft";

    const year = reqDateNow.getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "PurchaseRequisition", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "PurchaseRequisition", Year: year, LastNumber: 1 },
    });
    const prNumber = `PR-${year}-${String(seq.LastNumber).padStart(4, '0')}`;

    const newPr = await prisma.purchaseRequisitions.create({
      data: {
        PrNumber: prNumber,
        Department: body.department?.trim() || "Inventory",
        RequestedBy: body.requestedBy?.trim() || "Inventory Manager",
        RequestDate: reqDateNow,
        RequiredDate: body.requiredDate ? new Date(body.requiredDate) : new Date(reqDateNow.getTime() + 7 * 24 * 60 * 60 * 1000),
        Status: initialStatus,
        RequestType: body.requestType?.trim() || "Stock Replenishment",
        Priority: body.priority?.trim() || "Normal",
        Purpose: body.purpose || "",
        Notes: body.notes || "",
        EstimatedTotalAmount: estTotal,
        UpdatedAt: reqDateNow,
        PurchaseRequisitionItems: {
          create: body.items.map((i: any) => ({
            ItemId: i.itemId,
            SuggestedSupplierId: i.suggestedSupplierId || null,
            RequestedQuantity: i.requestedQuantity,
            PurchaseUomId: i.purchaseUomId,
            EstimatedUnitPrice: i.estimatedUnitPrice || 0,
          }))
        }
      },
      include: {
        PurchaseRequisitionItems: {
          include: { Items: { include: { Inventories: true } }, SuggestedSuppliers: true, UnitOfMeasures: true }
        }
      }
    });

    const response = {
      prId: newPr.PrId,
      prNumber: newPr.PrNumber,
      department: newPr.Department,
      requestedBy: newPr.RequestedBy,
      requestDate: newPr.RequestDate,
      requiredDate: newPr.RequiredDate,
      status: newPr.Status,
      requestType: newPr.RequestType,
      priority: newPr.Priority,
      purpose: newPr.Purpose,
      notes: newPr.Notes,
      estimatedTotalAmount: Number(newPr.EstimatedTotalAmount),
      updatedAt: newPr.UpdatedAt,
      items: newPr.PurchaseRequisitionItems.map(i => ({
        prItemId: i.PrItemId,
        itemId: i.ItemId,
        itemName: i.Items?.ItemName || "",
        suggestedSupplierId: i.SuggestedSupplierId,
        suggestedSupplierName: i.SuggestedSuppliers?.CompanyName || "",
        requestedQuantity: Number(i.RequestedQuantity),
        purchaseUomId: i.PurchaseUomId,
        purchaseUomAbbreviation: i.UnitOfMeasures?.Abbreviation || "",
        estimatedUnitPrice: Number(i.EstimatedUnitPrice),
        totalEstimatedValue: Number(i.RequestedQuantity) * Number(i.EstimatedUnitPrice),
      }))
    };

    return NextResponse.json({ success: true, message: "Purchase requisition created successfully.", data: response });
  } catch (error: any) {
    console.error("Error creating purchase requisition:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
