import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const pr = await prisma.purchaseRequisitions.findUnique({
      where: { PrId: id },
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

    if (!pr) {
      return NextResponse.json({ success: false, message: `Purchase requisition ${id} not found.` }, { status: 404 });
    }

    const data = {
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
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching purchase requisition:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const pr = await prisma.purchaseRequisitions.findUnique({
      where: { PrId: id },
      include: { PurchaseRequisitionItems: true }
    });

    if (!pr) {
      return NextResponse.json({ success: false, message: `Purchase requisition ${id} not found.` }, { status: 404 });
    }

    if (pr.Status !== "Draft" && pr.Status !== "Returned") {
      return NextResponse.json({ success: false, message: `Only Draft or Returned requisitions can be edited. Current status: ${pr.Status}.` }, { status: 400 });
    }

    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ success: false, message: "Requisition must contain at least one item." }, { status: 400 });
    }

    const itemIds = body.items.map((i: any) => i.itemId);
    const uniqueIds = new Set(itemIds);
    if (uniqueIds.size !== itemIds.length) {
      return NextResponse.json({ success: false, message: "Duplicate ingredient detected. Please consolidate duplicate lines before proceeding." }, { status: 400 });
    }

    const estTotal = body.items.reduce((acc: number, i: any) => acc + (Number(i.requestedQuantity) * Number(i.estimatedUnitPrice || 0)), 0);

    let newStatus = pr.Status;
    if (body.submitForApproval) {
      newStatus = "PendingApproval";
    }

    // Delete existing items
    await prisma.purchaseRequisitionItems.deleteMany({
      where: { PrId: id }
    });

    const updatedPr = await prisma.purchaseRequisitions.update({
      where: { PrId: id },
      data: {
        Department: body.department?.trim() || pr.Department,
        RequiredDate: body.requiredDate ? new Date(body.requiredDate) : pr.RequiredDate,
        RequestType: body.requestType?.trim() || pr.RequestType,
        Priority: body.priority?.trim() || pr.Priority,
        Purpose: body.purpose !== undefined ? body.purpose : pr.Purpose,
        Notes: body.notes !== undefined ? body.notes : pr.Notes,
        EstimatedTotalAmount: estTotal,
        UpdatedAt: new Date(),
        Status: newStatus,
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
      prId: updatedPr.PrId,
      prNumber: updatedPr.PrNumber,
      department: updatedPr.Department,
      requestedBy: updatedPr.RequestedBy,
      requestDate: updatedPr.RequestDate,
      requiredDate: updatedPr.RequiredDate,
      status: updatedPr.Status,
      requestType: updatedPr.RequestType,
      priority: updatedPr.Priority,
      purpose: updatedPr.Purpose,
      notes: updatedPr.Notes,
      estimatedTotalAmount: Number(updatedPr.EstimatedTotalAmount),
      updatedAt: updatedPr.UpdatedAt,
      items: updatedPr.PurchaseRequisitionItems.map(i => ({
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

    return NextResponse.json({ success: true, message: "Purchase requisition updated successfully.", data: response });
  } catch (error: any) {
    console.error("Error updating purchase requisition:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
