import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const pr = await prisma.purchaseRequisitions.findUnique({
      where: { PrId: id },
    });

    if (!pr) {
      return NextResponse.json({ success: false, message: `Purchase requisition ${id} not found.` }, { status: 404 });
    }

    const validStatuses = ["Draft", "PendingApproval", "Approved", "Rejected", "Returned", "ConvertedToPO", "Cancelled"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ success: false, message: `Invalid status '${body.status}'. Allowed: ${validStatuses.join(", ")}.` }, { status: 400 });
    }

    const updateData: any = {
      Status: body.status,
      UpdatedAt: new Date(),
    };

    if (body.adminNotes?.trim()) {
      updateData.AdminNotes = body.adminNotes.trim();
    } else if (body.comments?.trim()) {
      updateData.AdminNotes = body.comments.trim();
    }

    const updatedPr = await prisma.purchaseRequisitions.update({
      where: { PrId: id },
      data: updateData,
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
      adminNotes: updatedPr.AdminNotes,
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

    return NextResponse.json({ success: true, message: `Requisition status updated to ${body.status}.`, data: response });
  } catch (error: any) {
    console.error("Error updating status on PR:", error);
    return NextResponse.json({ success: false, message: "An error occurred while updating status." }, { status: 500 });
  }
}
