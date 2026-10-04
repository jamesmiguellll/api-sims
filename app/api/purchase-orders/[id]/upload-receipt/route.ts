import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || file.size === 0) {
      return NextResponse.json({ success: false, message: "No file was uploaded." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: "Receipt file size cannot exceed 10MB." }, { status: 400 });
    }

    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
    const extension = path.extname(file.name).toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      return NextResponse.json({ success: false, message: "Invalid file type. Allowed formats: JPG, PNG, WEBP, PDF." }, { status: 400 });
    }

    const order = await prisma.purchaseOrders.findUnique({ where: { PoId: id } });
    if (!order) {
      return NextResponse.json({ success: false, message: "Purchase order not found." }, { status: 404 });
    }

    const uploadsFolder = path.join(process.cwd(), "public", "uploads", "receipts");
    if (!fs.existsSync(uploadsFolder)) {
      fs.mkdirSync(uploadsFolder, { recursive: true });
    }

    const uniqueFileName = `${crypto.randomUUID()}_${file.name}`;
    const filePath = path.join(uploadsFolder, uniqueFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    const imageUrl = `/uploads/receipts/${uniqueFileName}`;

    const updatedOrder = await prisma.purchaseOrders.update({
      where: { PoId: id },
      data: { ProofImageUrl: imageUrl },
      include: {
        Suppliers: true,
        PurchaseRequisition: true,
        PurchaseOrderItems: {
          include: { Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } }, UnitOfMeasures: true }
        }
      }
    });

    const response = {
      poId: updatedOrder.PoId,
      prId: updatedOrder.PrId,
      prNumber: updatedOrder.PurchaseRequisition?.PrNumber,
      supplierId: updatedOrder.SupplierId,
      supplierName: updatedOrder.Suppliers?.CompanyName || "",
      orderDate: updatedOrder.OrderDate,
      poNumber: updatedOrder.PoNumber,
      expectedArrivalDate: updatedOrder.ExpectedArrivalDate,
      status: updatedOrder.Status,
      paymentType: updatedOrder.PaymentType,
      totalAmount: Number(updatedOrder.TotalAmount),
      requestedBy: updatedOrder.RequestedBy,
      adminNotes: updatedOrder.AdminNotes,
      qaNotes: updatedOrder.QaNotes,
      qaInspectedDate: updatedOrder.QaInspectedDate,
      qaStatus: updatedOrder.QaStatus,
      inspectedBy: updatedOrder.InspectedBy,
      items: updatedOrder.PurchaseOrderItems.map(i => ({
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

    return NextResponse.json({ success: true, message: "Receipt uploaded successfully.", data: response });
  } catch (error: any) {
    console.error("Error uploading receipt:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  }
}
