import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const qrRaw = body.qrRaw?.toString().trim();
    const ingredientId = Number(body.ingredientId);
    const scannedBy = body.scannedBy || "Inventory Manager";

    if (!qrRaw) {
      return NextResponse.json({ success: false, message: "QR payload is required." }, { status: 400 });
    }

    const issuance = await prisma.materialIssuances.findUnique({
      where: { IssuanceId: id },
      include: {
        ProductionRequests: {
          include: {
            ProductionReqLotReservations: {
              include: {
                InventoryLots: true,
                Items: true,
              },
            },
          },
        },
      },
    });

    if (!issuance) {
      return NextResponse.json({ success: false, message: "Material issuance not found." }, { status: 404 });
    }

    if (issuance.Status === "Issued") {
      return NextResponse.json({ success: false, message: "This issuance has already been completed." }, { status: 400 });
    }

    // Parse QR payload (from Goods & Receiving Stock-In / Put-Away QR code)
    let scannedLotCode = qrRaw;
    let scannedItemId: number | null = null;

    try {
      const parsed = typeof qrRaw === "object" ? qrRaw : JSON.parse(qrRaw);
      if (parsed.lot) scannedLotCode = String(parsed.lot).trim();
      else if (parsed.lotCode) scannedLotCode = String(parsed.lotCode).trim();
      else if (parsed.lot_code) scannedLotCode = String(parsed.lot_code).trim();
      else if (parsed.lotNo) scannedLotCode = String(parsed.lotNo).trim();
      else if (parsed.code) scannedLotCode = String(parsed.code).trim();
      if (parsed.itemId) scannedItemId = Number(parsed.itemId);
    } catch {
      // Not JSON, use raw string as lot code
      scannedLotCode = qrRaw.trim();
    }

    // Find the allocated reservation in this issuance that matches the scanned lot code
    const matchingReservation =
      issuance.ProductionRequests.ProductionReqLotReservations.find((res) => {
        const lotMatch = res.InventoryLots.LotCode.trim().toLowerCase() === scannedLotCode.trim().toLowerCase();
        const ingMatch = !ingredientId || res.IngredientId === ingredientId;
        return lotMatch && ingMatch;
      }) ||
      issuance.ProductionRequests.ProductionReqLotReservations.find((res) => {
        return res.InventoryLots.LotCode.trim().toLowerCase() === scannedLotCode.trim().toLowerCase();
      });

    if (!matchingReservation) {
      return NextResponse.json({
        success: false,
        verified: false,
        message: `Verification failed. Lot code '${scannedLotCode}' is not assigned to this ingredient or request.`,
      }, { status: 400 });
    }

    // Record the verified scan
    const scan = await prisma.$transaction(async (tx) => {
      // Upsert scan
      const existingScan = await tx.materialIssuanceScans.findFirst({
        where: {
          IssuanceId: id,
          IngredientId: matchingReservation.IngredientId,
          LotId: matchingReservation.LotId,
        },
      });

      let recordedScan;
      if (existingScan) {
        recordedScan = await tx.materialIssuanceScans.update({
          where: { ScanId: existingScan.ScanId },
          data: {
            IsVerified: true,
            ScannedAt: new Date(),
            ScannedBy: scannedBy,
          },
        });
      } else {
        recordedScan = await tx.materialIssuanceScans.create({
          data: {
            IssuanceId: id,
            IngredientId: matchingReservation.IngredientId,
            ItemId: matchingReservation.ItemId,
            LotId: matchingReservation.LotId,
            LotCode: matchingReservation.InventoryLots.LotCode,
            ScannedAt: new Date(),
            ScannedBy: scannedBy,
            IsVerified: true,
          },
        });
      }

      if (issuance.Status === "Pending") {
        await tx.materialIssuances.update({
          where: { IssuanceId: id },
          data: { Status: "Scanning" },
        });
      }

      return recordedScan;
    });

    return NextResponse.json({
      success: true,
      verified: true,
      message: `Verified: ${matchingReservation.Items.ItemName} (Lot: ${matchingReservation.InventoryLots.LotCode})`,
      data: {
        scanId: scan.ScanId,
        ingredientId: matchingReservation.IngredientId,
        lotId: matchingReservation.LotId,
        lotCode: matchingReservation.InventoryLots.LotCode,
        itemName: matchingReservation.Items.ItemName,
      },
    });
  } catch (error: any) {
    console.error("POST /api/material-issuances/[id]/scan error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
