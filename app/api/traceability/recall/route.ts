import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Execute a lot recall: puts affected lots on hold
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const lotCode = body.lotCode as string;
    const applyHold = body.applyHold === true;

    if (!lotCode) {
      return NextResponse.json({ success: false, message: "lotCode is required." }, { status: 400 });
    }

    const lot = await prisma.inventoryLots.findFirst({ where: { LotCode: lotCode } });
    if (!lot) {
      return NextResponse.json({ success: false, message: `Lot "${lotCode}" not found.` }, { status: 404 });
    }

    if (applyHold) {
      // Place the lot on hold
      await prisma.inventoryLots.updateMany({
        where: { LotCode: lotCode },
        data: {
          Status: "OnHold",
          HoldReason: `Recall initiated via traceability module`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: applyHold
        ? `Lot "${lotCode}" placed on hold. Recall executed.`
        : `Recall simulated for lot "${lotCode}". No inventory changes applied.`,
      data: { lotCode, holdApplied: applyHold },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
