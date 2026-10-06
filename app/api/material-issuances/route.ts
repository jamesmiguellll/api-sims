import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export function mapMaterialIssuance(iss: any) {
  const req = iss.ProductionRequests;
  const product = req?.FinishedProducts;
  const recipe = req?.Recipes;

  return {
    issuanceId: iss.IssuanceId,
    issuanceNumber: iss.IssuanceNumber,
    prodReqId: iss.ProdReqId,
    reqNumber: req?.ReqNumber ?? "",
    productName: product?.Items?.ItemName ?? "",
    productCode: product?.Items?.ItemCode ?? "",
    sku: product?.Sku ?? "",
    recipeName: recipe?.RecipeName ?? "",
    requestQuantity: Number(req?.Quantity ?? 0),
    priority: req?.Priority ?? "Normal",
    issuedBy: iss.IssuedBy ?? "",
    issuedAt: iss.IssuedAt ? iss.IssuedAt.toISOString() : null,
    status: iss.Status ?? "Pending",
    reqStatus: req?.Status ?? "",
    scans: (iss.MaterialIssuanceScans ?? []).map((s: any) => ({
      scanId: s.ScanId,
      ingredientId: s.IngredientId,
      itemId: s.ItemId,
      lotId: s.LotId,
      lotCode: s.LotCode,
      scannedAt: s.ScannedAt ? s.ScannedAt.toISOString() : null,
      scannedBy: s.ScannedBy,
      isVerified: s.IsVerified,
    })),
    reservations: (req?.ProductionReqLotReservations ?? []).map((res: any) => ({
      reservationId: res.ReservationId,
      ingredientId: res.IngredientId,
      itemId: res.ItemId,
      itemName: res.Items?.ItemName ?? "",
      itemCode: res.Items?.ItemCode ?? "",
      lotId: res.LotId,
      lotCode: res.InventoryLots?.LotCode ?? "",
      reservedQuantity: Number(res.ReservedQuantity),
      isReleased: res.IsReleased,
      expiryDate: res.InventoryLots?.ExpiryDate ? res.InventoryLots.ExpiryDate.toISOString() : null,
    })),
  };
}

export const ISSUANCE_INCLUDE = {
  ProductionRequests: {
    include: {
      FinishedProducts: {
        include: {
          Items: true,
        },
      },
      Recipes: {
        include: {
          RecipeIngredients: {
            include: {
              Items: true,
              Uom: true,
            },
          },
        },
      },
      ProductionReqLotReservations: {
        include: {
          Items: true,
          InventoryLots: true,
        },
      },
    },
  },
  MaterialIssuanceScans: {
    include: {
      Items: true,
      InventoryLots: true,
    },
  },
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "All";
    const prodReqId = searchParams.get("prodReqId");
    const search = searchParams.get("search")?.trim().toLowerCase() || "";

    const where: any = {};

    if (status !== "All") {
      where.Status = status;
    }

    if (prodReqId) {
      where.ProdReqId = Number(prodReqId);
    }

    if (search) {
      where.OR = [
        { IssuanceNumber: { contains: search, mode: "insensitive" } },
        { ProductionRequests: { ReqNumber: { contains: search, mode: "insensitive" } } },
        { ProductionRequests: { FinishedProducts: { Items: { ItemName: { contains: search, mode: "insensitive" } } } } },
      ];
    }

    const issuances = await prisma.materialIssuances.findMany({
      where,
      include: ISSUANCE_INCLUDE,
      orderBy: { IssuanceId: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: issuances.map(mapMaterialIssuance),
    });
  } catch (error: any) {
    console.error("GET /api/material-issuances error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prodReqId = Number(body.prodReqId);

    if (!prodReqId) {
      return NextResponse.json({ success: false, message: "Production Request ID is required." }, { status: 400 });
    }

    const prodReq = await prisma.productionRequests.findUnique({
      where: { ProdReqId: prodReqId },
      include: {
        MaterialIssuances: true,
        ProductionReqLotReservations: true,
      },
    });

    if (!prodReq) {
      return NextResponse.json({ success: false, message: "Production request not found." }, { status: 404 });
    }

    if (prodReq.Status !== "Approved") {
      return NextResponse.json(
        { success: false, message: `Only Approved requests can be issued. Current status: ${prodReq.Status}` },
        { status: 400 }
      );
    }

    // Check if there is already an active issuance
    const activeIssuance = prodReq.MaterialIssuances.find((i) => i.Status !== "Cancelled");
    if (activeIssuance) {
      const fullExisting = await prisma.materialIssuances.findUnique({
        where: { IssuanceId: activeIssuance.IssuanceId },
        include: ISSUANCE_INCLUDE,
      });
      return NextResponse.json({
        success: true,
        message: "Existing issuance session loaded.",
        data: mapMaterialIssuance(fullExisting),
      });
    }

    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "Issuance", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "Issuance", Year: year, LastNumber: 1 },
    });
    const issuanceNumber = `ISS-${year}-${String(seq.LastNumber).padStart(4, "0")}`;

    const newIssuance = await prisma.materialIssuances.create({
      data: {
        IssuanceNumber: issuanceNumber,
        ProdReqId: prodReqId,
        IssuedBy: body.issuedBy || "Inventory Manager",
        Status: "Pending",
      },
      include: ISSUANCE_INCLUDE,
    });

    return NextResponse.json({
      success: true,
      message: "Material issuance session initialized.",
      data: mapMaterialIssuance(newIssuance),
    });
  } catch (error: any) {
    console.error("POST /api/material-issuances error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
