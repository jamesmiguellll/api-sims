import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const grnId = searchParams.get("grnId");
    
    let whereClause = {};
    if (grnId) {
      whereClause = {
        ReferenceType: "GRN",
        ReferenceId: parseInt(grnId, 10)
      };
    }

    const inspections = await prisma.qualityInspections.findMany({
      where: whereClause,
      include: {
        QualityInspectionItems: {
          include: {
            Items: {
              include: {
                UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true,
                Uom: true,
              }
            },
            InventoryLots: true
          }
        }
      }
    });

    const responseData = inspections.map((q) => ({
      inspectionId: q.InspectionId,
      inspectionNumber: q.InspectionNumber,
      inspectionType: q.InspectionType,
      referenceType: q.ReferenceType,
      referenceId: q.ReferenceId,
      referenceNumber: q.ReferenceNumber,
      inspectorId: q.InspectorId,
      inspectorName: q.InspectorName,
      inspectionDate: q.InspectionDate,
      status: q.Status,
      overallNotes: q.OverallNotes,
      completedAt: q.CompletedAt,
      items: q.QualityInspectionItems.map((qi) => ({
        inspectionItemId: qi.InspectionItemId,
        itemId: qi.ItemId,
        itemName: qi.Items?.ItemName,
        categoryName: "", // Optional mapping
        lotId: qi.LotId,
        deliveredQuantity: Number(qi.DeliveredQuantity),
        acceptedQuantity: Number(qi.AcceptedQuantity),
        rejectedQuantity: Number(qi.RejectedQuantity),
        concessionQuantity: Number(qi.ConcessionQuantity),
        defectReason: qi.DefectReason || "",
        notes: qi.Notes || "",
        lot: qi.InventoryLots ? {
          lotId: qi.InventoryLots.LotId,
          lotCode: qi.InventoryLots.LotCode,
          expiryDate: qi.InventoryLots.ExpiryDate
        } : null
      }))
    }));

    return NextResponse.json({ success: true, data: responseData });
  } catch (error: any) {
    console.error("Error fetching QA inspections:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch QA inspections." }, { status: 500 });
  }
}
