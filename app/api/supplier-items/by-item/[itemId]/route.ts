import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ itemId: string }> }) {
  const params = await props.params;
  try {
    const itemId = parseInt(params.itemId, 10);

    const items = await prisma.supplierItems.findMany({
      where: { ItemId: itemId, IsActive: true },
      include: {
        Suppliers: true,
        UnitOfMeasures: true,
        Items: true,
      },
      orderBy: [{ IsPreferred: "desc" }, { UnitPrice: "asc" }],
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
