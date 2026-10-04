import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ supplierId: string }> }) {
  const params = await props.params;
  try {
    const supplierId = parseInt(params.supplierId, 10);

    const items = await prisma.supplierItems.findMany({
      where: { SupplierId: supplierId, IsActive: true },
      include: {
        Items: { include: { Category: true, UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } },
        UnitOfMeasures: true,
      },
      orderBy: [{ IsPreferred: "desc" }, { Items: { ItemName: "asc" } }],
    });

    const data = items.map((si) => ({
      supplierId: si.SupplierId,
      itemId: si.ItemId,
      itemName: si.Items?.ItemName ?? "",
      itemCode: si.Items?.ItemCode ?? "",
      categoryName: si.Items?.Category?.CategoryName ?? "",
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
