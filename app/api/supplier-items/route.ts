import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/supplier-items/by-item/[itemId]
// GET /api/supplier-items/by-supplier/[supplierId]
// POST /api/supplier-items
// DELETE /api/supplier-items/[supplierId]/[itemId]

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId") ? parseInt(searchParams.get("itemId")!, 10) : null;
    const supplierId = searchParams.get("supplierId") ? parseInt(searchParams.get("supplierId")!, 10) : null;

    const where: any = { IsActive: true };
    if (itemId) where.ItemId = itemId;
    if (supplierId) where.SupplierId = supplierId;

    const items = await prisma.supplierItems.findMany({
      where,
      include: {
        Suppliers: true,
        Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } },
        UnitOfMeasures: true,
      },
    });

    const data = items.map((si) => ({
      supplierId: si.SupplierId,
      supplierName: si.Suppliers?.CompanyName ?? "",
      itemId: si.ItemId,
      itemName: si.Items?.ItemName ?? "",
      supplierSku: si.SupplierSku ?? "",
      supplierItemName: si.SupplierItemName ?? "",
      unitPrice: Number(si.UnitPrice),
      currency: si.Currency,
      purchaseUomId: si.PurchaseUomId,
      purchaseUomAbbr: si.UnitOfMeasures?.Abbreviation ?? "",
      packSize: Number(si.PackSize),
      leadTimeDays: si.LeadTimeDays,
      minOrderQuantity: Number(si.MinOrderQuantity),
      isPreferred: si.IsPreferred,
      lastPurchasePrice: si.LastPurchasePrice ? Number(si.LastPurchasePrice) : null,
      lastPurchaseDate: si.LastPurchaseDate?.toISOString() ?? null,
      isActive: si.IsActive,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Upsert to handle re-activating an existing supplier-item link
    const si = await prisma.supplierItems.upsert({
      where: { SupplierId_ItemId: { SupplierId: body.supplierId, ItemId: body.itemId } },
      update: {
        SupplierSku: body.supplierSku ?? null,
        SupplierItemName: body.supplierItemName ?? null,
        UnitPrice: body.unitPrice,
        Currency: body.currency ?? "PHP",
        PurchaseUomId: body.purchaseUomId,
        PackSize: body.packSize ?? 1,
        LeadTimeDays: body.leadTimeDays ?? 0,
        MinOrderQuantity: body.minOrderQuantity ?? 1,
        IsPreferred: body.isPreferred ?? false,
        IsActive: true,
      },
      create: {
        SupplierId: body.supplierId,
        ItemId: body.itemId,
        SupplierSku: body.supplierSku ?? null,
        SupplierItemName: body.supplierItemName ?? null,
        UnitPrice: body.unitPrice,
        Currency: body.currency ?? "PHP",
        PurchaseUomId: body.purchaseUomId,
        PackSize: body.packSize ?? 1,
        LeadTimeDays: body.leadTimeDays ?? 0,
        MinOrderQuantity: body.minOrderQuantity ?? 1,
        IsPreferred: body.isPreferred ?? false,
        IsActive: true,
      },
      include: { Suppliers: true, Items: true, UnitOfMeasures: true },
    });

    return NextResponse.json({ success: true, message: "Supplier item saved.", data: si });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
