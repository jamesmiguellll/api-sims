import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function mapCount(cc: any) {
  return {
    cycleCountId: cc.CycleCountId,
    countNumber: cc.CountNumber,
    locationId: cc.LocationId,
    locationName: cc.Locations?.LocationName ?? "",
    countDate: cc.CountDate?.toISOString() ?? null,
    reconciledDate: cc.ReconciledDate?.toISOString() ?? null,
    status: cc.Status,
    countedBy: cc.CountedBy,
    reconciledBy: cc.ReconciledBy ?? "",
    notes: cc.Notes ?? "",
    totalSystemValue: Number(cc.TotalSystemValue),
    totalCountedValue: Number(cc.TotalCountedValue),
    totalVarianceValue: Number(cc.TotalVarianceValue),
    itemCount: cc.CycleCountItems?.length ?? 0,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));

    const [total, counts] = await Promise.all([
      prisma.cycleCounts.count(),
      prisma.cycleCounts.findMany({
        include: { Locations: true, CycleCountItems: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { CycleCountId: "desc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: counts.map(mapCount),
        totalCount: total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Auto-generate count number
    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "CycleCount", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "CycleCount", Year: year, LastNumber: 1 },
    });
    const countNumber = `CC-${year}-${String(seq.LastNumber).padStart(4, "0")}`;

    // Snapshot all inventory items at this location
    const inventories = await prisma.inventories.findMany({
      where: { LocationId: body.locationId },
      include: { Items: { include: { UnitOfMeasures_Items_StockUomIdToUnitOfMeasures: true } } },
    });

    const newCount = await prisma.cycleCounts.create({
      data: {
        CountNumber: countNumber,
        LocationId: body.locationId,
        CountDate: new Date(),
        Status: "Open",
        CountedBy: body.countedBy ?? "System",
        Notes: body.notes ?? "",
        TotalSystemValue: 0,
        TotalCountedValue: 0,
        TotalVarianceValue: 0,
        CycleCountItems: {
          create: inventories.map((inv) => ({
            ItemId: inv.ItemId,
            SystemQuantity: inv.CurrentStock,
            CountedQuantity: 0,
            UnitCost: 0,
          })),
        },
      },
      include: { Locations: true, CycleCountItems: true },
    });

    return NextResponse.json({ success: true, message: "Cycle count created.", data: mapCount(newCount) });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
