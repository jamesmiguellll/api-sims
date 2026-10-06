import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ISSUANCE_INCLUDE, mapMaterialIssuance } from "../../route";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID." }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const issuedBy = body.issuedBy || "Inventory Manager";
    const bypassScanCheck = Boolean(body.bypassScanCheck);

    const issuance = await prisma.materialIssuances.findUnique({
      where: { IssuanceId: id },
      include: {
        MaterialIssuanceScans: true,
        ProductionRequests: {
          include: {
            ProductionReqLotReservations: {
              where: { IsReleased: false },
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
      return NextResponse.json({ success: false, message: "Materials have already been issued." }, { status: 400 });
    }

    const reservations = issuance.ProductionRequests.ProductionReqLotReservations;
    if (reservations.length === 0) {
      return NextResponse.json({ success: false, message: "No active lot reservations found for this request." }, { status: 400 });
    }

    // Verify all reservations have verified scans (unless bypass explicitly requested)
    if (!bypassScanCheck) {
      const verifiedLotIds = new Set(
        issuance.MaterialIssuanceScans.filter((s) => s.IsVerified).map((s) => s.LotId)
      );

      const unscanned = reservations.filter((r) => !verifiedLotIds.has(r.LotId));
      if (unscanned.length > 0) {
        return NextResponse.json({
          success: false,
          message: `Cannot issue materials. ${unscanned.length} ingredient lot(s) have not been verified by QR scan yet.`,
          unscannedLots: unscanned.map((u) => ({
            itemName: u.Items.ItemName,
            lotCode: u.InventoryLots.LotCode,
          })),
        }, { status: 400 });
      }
    }

    // Execute issuance transaction
    await prisma.$transaction(async (tx) => {
      const now = new Date();

      for (const res of reservations) {
        const qtyToDeduct = Number(res.ReservedQuantity);
        const lot = res.InventoryLots;

        // 1. Decrement QuantityRemaining & ReservedQuantity on InventoryLots
        await tx.inventoryLots.update({
          where: { LotId: lot.LotId },
          data: {
            QuantityRemaining: { decrement: qtyToDeduct },
            ReservedQuantity: { decrement: qtyToDeduct },
          },
        });

        // 2. Decrement CurrentStock on Inventories
        if (lot.LocationId) {
          const inv = await tx.inventories.findUnique({
            where: {
              ItemId_LocationId: {
                ItemId: res.ItemId,
                LocationId: lot.LocationId,
              },
            },
          });

          if (inv) {
            await tx.inventories.update({
              where: {
                ItemId_LocationId: {
                  ItemId: res.ItemId,
                  LocationId: lot.LocationId,
                },
              },
              data: {
                CurrentStock: { decrement: qtyToDeduct },
              },
            });
          }
        }

        // 3. Create StockLedgers row
        await tx.stockLedgers.create({
          data: {
            LotId: lot.LotId,
            ItemId: res.ItemId,
            LocationId: lot.LocationId,
            MovementType: "PRODUCTION_ISSUE",
            Quantity: -qtyToDeduct,
            UomId: lot.UomId,
            UnitCost: lot.UnitCost,
            ReferenceType: "MaterialIssuance",
            ReferenceId: issuance.IssuanceNumber,
            UserId: issuedBy,
            UserName: issuedBy,
            PostedAt: now,
            Notes: `Issued for Production Request ${issuance.ProductionRequests.ReqNumber}`,
          },
        });

        // 4. Mark reservation as released
        await tx.productionReqLotReservations.update({
          where: { ReservationId: res.ReservationId },
          data: {
            IsReleased: true,
            ReleasedAt: now,
          },
        });
      }

      // 5. Update MaterialIssuances
      await tx.materialIssuances.update({
        where: { IssuanceId: id },
        data: {
          Status: "Issued",
          IssuedAt: now,
          IssuedBy: issuedBy,
        },
      });

      // 6. Update ProductionRequests status
      await tx.productionRequests.update({
        where: { ProdReqId: issuance.ProdReqId },
        data: {
          Status: "Materials Issued",
          UpdatedAt: now,
        },
      });
    });

    const fullUpdated = await prisma.materialIssuances.findUnique({
      where: { IssuanceId: id },
      include: ISSUANCE_INCLUDE,
    });

    return NextResponse.json({
      success: true,
      message: `Materials issued successfully for ${issuance.ProductionRequests.ReqNumber}. The Head Cook can now start production.`,
      data: mapMaterialIssuance(fullUpdated),
    });
  } catch (error: any) {
    console.error("POST /api/material-issuances/[id]/issue error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
