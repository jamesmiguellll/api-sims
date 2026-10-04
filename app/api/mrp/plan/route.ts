import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// MRP Planning: given planned batch counts per recipe, compute gross requirements,
// compare against on-hand inventory, and return net requirements.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const plannedBatches: Array<{ recipeId: number; batchCount: number }> = body.plannedBatches || [];

    if (plannedBatches.length === 0) {
      return NextResponse.json({ success: false, message: "No planned batches provided." }, { status: 400 });
    }

    // Aggregate gross requirements across all planned runs
    const grossMap = new Map<number, number>(); // itemId -> total qty needed

    for (const run of plannedBatches) {
      const recipe = await prisma.recipes.findUnique({
        where: { RecipeId: run.recipeId },
        include: { RecipeIngredients: { include: { Items: true, Uom: true } } },
      });
      if (!recipe) continue;

      const multiplier = run.batchCount || 1;
      for (const ing of recipe.RecipeIngredients) {
        const qty = Number(ing.StandardQuantity) * multiplier;
        grossMap.set(ing.ItemId, (grossMap.get(ing.ItemId) ?? 0) + qty);
      }
    }

    if (grossMap.size === 0) {
      return NextResponse.json({ success: false, message: "No ingredients found for the selected recipes." }, { status: 400 });
    }

    // Fetch on-hand inventory for all required items
    const itemIds = Array.from(grossMap.keys());
    const [inventories, pendingPOs, supplierItems, items] = await Promise.all([
      prisma.inventories.findMany({
        where: { ItemId: { in: itemIds } },
      }),
      prisma.purchaseOrderItems.findMany({
        where: {
          ItemId: { in: itemIds },
          PurchaseOrders: { Status: { in: ["Approved", "Ordered"] } },
        },
        include: { PurchaseOrders: true },
      }),
      prisma.supplierItems.findMany({
        where: { ItemId: { in: itemIds }, IsActive: true, IsPreferred: true },
        include: { Suppliers: true, UnitOfMeasures: true },
        orderBy: [{ IsPreferred: "desc" }, { UnitPrice: "asc" }],
      }),
      prisma.items.findMany({
        where: { ItemId: { in: itemIds } },
        include: {
          Category: true,
          UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true,
        },
      }),
    ]);

    // Build lookup maps
    const onHandMap = new Map<number, number>();
    for (const inv of inventories) {
      onHandMap.set(inv.ItemId, (onHandMap.get(inv.ItemId) ?? 0) + Number(inv.CurrentStock));
    }

    const onOrderMap = new Map<number, number>();
    for (const poi of pendingPOs) {
      const remaining = Number(poi.PoItemQuantity) - Number(poi.ReceivedQuantity ?? 0);
      if (remaining > 0) {
        onOrderMap.set(poi.ItemId, (onOrderMap.get(poi.ItemId) ?? 0) + remaining);
      }
    }

    const supplierMap = new Map<number, any>();
    for (const si of supplierItems) {
      if (!supplierMap.has(si.ItemId)) supplierMap.set(si.ItemId, si);
    }

    const itemMap = new Map<number, any>();
    for (const item of items) itemMap.set(item.ItemId, item);

    const requirements = [];
    for (const [itemId, gross] of grossMap) {
      const item = itemMap.get(itemId);
      const onHand = onHandMap.get(itemId) ?? 0;
      const onOrder = onOrderMap.get(itemId) ?? 0;
      const netReq = Math.max(0, gross - onHand - onOrder);
      const si = supplierMap.get(itemId);
      const uom = item?.UnitOfMeasures_Items_StockUomIdToUnitOfMeasures;

      requirements.push({
        itemId,
        itemName: item?.ItemName ?? `Item ${itemId}`,
        categoryName: item?.Category?.CategoryName ?? "—",
        uomName: uom?.Abbreviation ?? "Unit",
        grossRequirement: gross,
        onHandQty: onHand,
        onOrderQty: onOrder,
        netRequirement: netReq,
        reorderPoint: Number(item?.MinStockLevel ?? 0),
        urgency: netReq > gross * 0.5 ? "High" : netReq > 0 ? "Normal" : "None",
        preferredSupplier: si?.Suppliers?.CompanyName ?? "—",
        estimatedCost: si ? Number(si.UnitPrice) * netReq : 0,
      });
    }

    // Sort by urgency: High first, then Normal, then None
    requirements.sort((a, b) => {
      const order: Record<string, number> = { High: 0, Normal: 1, None: 2 };
      return (order[a.urgency] ?? 99) - (order[b.urgency] ?? 99);
    });

    return NextResponse.json({ success: true, data: { requirements } });
  } catch (error: any) {
    console.error("POST /api/mrp/plan error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
