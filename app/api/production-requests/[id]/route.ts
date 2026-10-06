import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PROD_REQ_INCLUDE, mapProductionRequest } from "../route";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID." }, { status: 400 });
  }

  try {
    const prodReq = await prisma.productionRequests.findUnique({
      where: { ProdReqId: id },
      include: PROD_REQ_INCLUDE,
    });

    if (!prodReq) {
      return NextResponse.json({ success: false, message: "Production request not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: mapProductionRequest(prodReq) });
  } catch (error: any) {
    console.error("GET /api/production-requests/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const action = body.action; // 'submit_approval' | 'approve' | 'reject' | 'cancel' | undefined

    const existing = await prisma.productionRequests.findUnique({
      where: { ProdReqId: id },
      include: {
        ProductionReqLotReservations: true,
        Recipes: {
          include: {
            RecipeIngredients: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ success: false, message: "Production request not found." }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // ── SUBMIT FOR APPROVAL ────────────────────────────────────────────────
      if (action === "submit_approval") {
        if (existing.Status !== "Draft") {
          throw new Error(`Cannot submit request in '${existing.Status}' status for approval.`);
        }

        const req = await tx.productionRequests.update({
          where: { ProdReqId: id },
          data: {
            Status: "Pending Approval",
            UpdatedAt: new Date(),
          },
        });

        await tx.approvalRequests.create({
          data: {
            EntityType: "ProductionRequest",
            EntityId: id,
            DocumentNumber: existing.ReqNumber,
            Amount: 0,
            Status: "Pending",
            Reason: existing.Reason || "Production Request Approval",
            RequestedBy: body.requestedBy || existing.RequestedBy,
            RequestedAt: new Date(),
          },
        });

        return req;
      }

      // ── ADMIN APPROVE ──────────────────────────────────────────────────────
      if (action === "approve") {
        if (existing.Status !== "Pending Approval") {
          throw new Error(`Only requests in 'Pending Approval' can be approved. Current: ${existing.Status}`);
        }

        const approverName = body.approvedBy || "Admin";

        const req = await tx.productionRequests.update({
          where: { ProdReqId: id },
          data: {
            Status: "Approved",
            ApprovedBy: approverName,
            ApprovedAt: new Date(),
            AdminNotes: body.adminNotes ?? existing.AdminNotes,
            UpdatedAt: new Date(),
          },
        });

        // Update ApprovalRequests if exists
        await tx.approvalRequests.updateMany({
          where: {
            EntityType: "ProductionRequest",
            EntityId: id,
            Status: "Pending",
          },
          data: {
            Status: "Approved",
            ApproverName: approverName,
            ActionAt: new Date(),
            Comments: body.adminNotes || "Approved",
          },
        });

        return req;
      }

      // ── ADMIN REJECT ───────────────────────────────────────────────────────
      if (action === "reject") {
        if (existing.Status !== "Pending Approval") {
          throw new Error(`Only requests in 'Pending Approval' can be rejected. Current: ${existing.Status}`);
        }

        const rejecterName = body.rejectedBy || "Admin";
        const reason = body.rejectionReason || "Requirements not met";

        // Release lot reservations
        for (const res of existing.ProductionReqLotReservations) {
          if (!res.IsReleased) {
            await tx.inventoryLots.update({
              where: { LotId: res.LotId },
              data: { ReservedQuantity: { decrement: res.ReservedQuantity } },
            });
            await tx.productionReqLotReservations.update({
              where: { ReservationId: res.ReservationId },
              data: { IsReleased: true, ReleasedAt: new Date() },
            });
          }
        }

        const req = await tx.productionRequests.update({
          where: { ProdReqId: id },
          data: {
            Status: "Rejected",
            RejectedBy: rejecterName,
            RejectedAt: new Date(),
            RejectionReason: reason,
            UpdatedAt: new Date(),
          },
        });

        await tx.approvalRequests.updateMany({
          where: {
            EntityType: "ProductionRequest",
            EntityId: id,
            Status: "Pending",
          },
          data: {
            Status: "Rejected",
            ApproverName: rejecterName,
            ActionAt: new Date(),
            Comments: reason,
          },
        });

        return req;
      }

      // ── CANCEL ─────────────────────────────────────────────────────────────
      if (action === "cancel") {
        if (["Completed", "In Production", "Cancelled"].includes(existing.Status)) {
          throw new Error(`Cannot cancel a request that is '${existing.Status}'.`);
        }

        // Release lot reservations
        for (const res of existing.ProductionReqLotReservations) {
          if (!res.IsReleased) {
            await tx.inventoryLots.update({
              where: { LotId: res.LotId },
              data: { ReservedQuantity: { decrement: res.ReservedQuantity } },
            });
            await tx.productionReqLotReservations.update({
              where: { ReservationId: res.ReservationId },
              data: { IsReleased: true, ReleasedAt: new Date() },
            });
          }
        }

        // Cancel pending approval request if any
        await tx.approvalRequests.updateMany({
          where: {
            EntityType: "ProductionRequest",
            EntityId: id,
            Status: "Pending",
          },
          data: {
            Status: "Cancelled",
            ActionAt: new Date(),
            Comments: "Request was cancelled by user.",
          },
        });

        return await tx.productionRequests.update({
          where: { ProdReqId: id },
          data: {
            Status: "Cancelled",
            UpdatedAt: new Date(),
          },
        });
      }

      // ── GENERAL EDIT (Draft only) ──────────────────────────────────────────
      if (existing.Status !== "Draft") {
        throw new Error("Only Draft requests can be edited.");
      }

      const updateData: any = {
        UpdatedAt: new Date(),
      };

      if (body.reason !== undefined) updateData.Reason = body.reason;
      if (body.priority !== undefined) updateData.Priority = body.priority === "Priority" ? "Priority" : "Normal";
      if (body.requiredDate !== undefined) updateData.RequiredDate = new Date(body.requiredDate);
      if (body.requiredTime !== undefined) updateData.RequiredTime = body.requiredTime;
      if (body.adminNotes !== undefined) updateData.AdminNotes = body.adminNotes;

      const newQty = body.quantity !== undefined ? Number(body.quantity) : Number(existing.Quantity);
      const newRecipeId = body.recipeId !== undefined ? Number(body.recipeId) : existing.RecipeId;

      if (newQty !== Number(existing.Quantity) || newRecipeId !== existing.RecipeId) {
        updateData.Quantity = newQty;
        updateData.RecipeId = newRecipeId;

        // Release old reservations
        for (const res of existing.ProductionReqLotReservations) {
          if (!res.IsReleased) {
            await tx.inventoryLots.update({
              where: { LotId: res.LotId },
              data: { ReservedQuantity: { decrement: res.ReservedQuantity } },
            });
          }
        }
        await tx.productionReqLotReservations.deleteMany({
          where: { ProdReqId: id },
        });

        // Re-allocate reservations
        const recipe = await tx.recipes.findUnique({
          where: { RecipeId: newRecipeId },
          include: { RecipeIngredients: true },
        });

        if (recipe) {
          const multiplier = Number(recipe.OutputQuantity) > 0 ? newQty / Number(recipe.OutputQuantity) : 1;
          for (const ing of recipe.RecipeIngredients) {
            const requiredQty = Number(ing.StandardQuantity) * multiplier;
            let stillNeeded = requiredQty;

            const lots = await tx.inventoryLots.findMany({
              where: {
                ItemId: ing.ItemId,
                Status: { in: ["Available", "Active"] },
                QuantityRemaining: { gt: 0 },
              },
              orderBy: [{ ExpiryDate: "asc" }, { ReceivedDate: "asc" }],
            });

            for (const lot of lots) {
              if (stillNeeded <= 0) break;
              const availableInLot = Math.max(0, Number(lot.QuantityRemaining) - Number(lot.ReservedQuantity || 0));
              if (availableInLot <= 0) continue;

              const toReserve = Math.min(stillNeeded, availableInLot);
              await tx.productionReqLotReservations.create({
                data: {
                  ProdReqId: id,
                  IngredientId: ing.IngredientId,
                  ItemId: ing.ItemId,
                  LotId: lot.LotId,
                  ReservedQuantity: toReserve,
                  IsReleased: false,
                },
              });

              await tx.inventoryLots.update({
                where: { LotId: lot.LotId },
                data: { ReservedQuantity: { increment: toReserve } },
              });

              stillNeeded -= toReserve;
            }
          }
        }
      }

      return await tx.productionRequests.update({
        where: { ProdReqId: id },
        data: updateData,
      });
    });

    const fullResult = await prisma.productionRequests.findUnique({
      where: { ProdReqId: id },
      include: PROD_REQ_INCLUDE,
    });

    return NextResponse.json({
      success: true,
      message: `Production request updated successfully.`,
      data: mapProductionRequest(fullResult),
    });
  } catch (error: any) {
    console.error("PATCH /api/production-requests/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update production request." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID." }, { status: 400 });
  }

  try {
    const existing = await prisma.productionRequests.findUnique({
      where: { ProdReqId: id },
      include: { ProductionReqLotReservations: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, message: "Production request not found." }, { status: 404 });
    }

    if (existing.Status !== "Draft") {
      return NextResponse.json(
        { success: false, message: `Only Draft requests can be deleted. Current status: ${existing.Status}` },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Release any reservations
      for (const res of existing.ProductionReqLotReservations) {
        if (!res.IsReleased) {
          await tx.inventoryLots.update({
            where: { LotId: res.LotId },
            data: { ReservedQuantity: { decrement: res.ReservedQuantity } },
          });
        }
      }

      await tx.productionReqLotReservations.deleteMany({ where: { ProdReqId: id } });
      await tx.productionRequests.delete({ where: { ProdReqId: id } });
    });

    return NextResponse.json({ success: true, message: "Production request deleted." });
  } catch (error: any) {
    console.error("DELETE /api/production-requests/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
