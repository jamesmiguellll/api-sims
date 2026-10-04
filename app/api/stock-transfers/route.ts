import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TRANSFER_INCLUDE = {
  FinishedProducts: { include: { Items: true } },
  Locations_StockTransfers_SourceLocationIdToLocations: true,
  Locations_StockTransfers_DestLocationIdToLocations: true,
};

function mapTransfer(t: any) {
  return {
    transferId: t.TransferId,
    transferNumber: t.TransferNumber,
    productId: t.ProductId,
    productName: t.FinishedProducts?.Items?.ItemName ?? "",
    variant: t.FinishedProducts?.Variant ?? "",
    sourceLocationId: t.SourceLocationId,
    sourceLocationName: t.Locations_StockTransfers_SourceLocationIdToLocations?.LocationName ?? "",
    destLocationId: t.DestLocationId,
    destLocationName: t.Locations_StockTransfers_DestLocationIdToLocations?.LocationName ?? "",
    transferQuantity: Number(t.TransferQuantity),
    status: t.Status,
    transferDate: t.TransferDate?.toISOString() ?? null,
    dispatchedDate: t.DispatchedDate?.toISOString() ?? null,
    receivedDate: t.ReceivedDate?.toISOString() ?? null,
    driverName: t.DriverName ?? "",
    vehiclePlate: t.VehiclePlate ?? "",
    receivedBy: t.ReceivedBy ?? "",
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";

    const where: any = {};
    if (status && status !== "All") where.Status = status;
    if (search) {
      where.OR = [
        { TransferNumber: { contains: search, mode: "insensitive" } },
        { FinishedProducts: { Items: { ItemName: { contains: search, mode: "insensitive" } } } },
      ];
    }

    const [total, transfers] = await Promise.all([
      prisma.stockTransfers.count({ where }),
      prisma.stockTransfers.findMany({
        where,
        include: TRANSFER_INCLUDE,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { TransferId: "desc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: transfers.map(mapTransfer),
        totalCount: total,
        totalPages: Math.ceil(total / pageSize),
        page,
        pageSize,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Generate transfer number
    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "Transfer", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "Transfer", Year: year, LastNumber: 1 },
    });
    const transferNumber = `TRF-${year}-${String(seq.LastNumber).padStart(4, "0")}`;

    const transfer = await prisma.stockTransfers.create({
      data: {
        TransferNumber: transferNumber,
        ProductId: body.productId,
        SourceLocationId: body.sourceLocationId,
        DestLocationId: body.destLocationId,
        TransferQuantity: body.transferQuantity,
        Status: "Pending",
        TransferDate: new Date(),
        DriverName: body.driverName ?? null,
        VehiclePlate: body.vehiclePlate ?? null,
      },
      include: TRANSFER_INCLUDE,
    });

    return NextResponse.json({ success: true, message: "Transfer created.", data: mapTransfer(transfer) });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
