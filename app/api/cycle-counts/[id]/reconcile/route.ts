import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const cc = await prisma.cycleCounts.findUnique({
      where: { CycleCountId: id },
      include: { CycleCountItems: { include: { Items: true } } },
    });

    if (!cc) {
      return NextResponse.json({ success: false, message: "Cycle count not found." }, { status: 404 });
    }
    if (cc.Status !== "Open") {
      return NextResponse.json(
        { success: false, message: `Cannot reconcile a count with status "${cc.Status}".` },
        { status: 400 }
      );
    }

    // Adjust inventory quantities based on variance
    for (const item of cc.CycleCountItems) {
      const variance = Number(item.CountedQuantity) - Number(item.SystemQuantity);
      if (variance === 0) continue;

      // Update the Inventories table
      await prisma.inventories.updateMany({
        where: { ItemId: item.ItemId, LocationId: cc.LocationId },
        data: { CurrentStock: { increment: variance } },
      });
    }

    // Mark as reconciled
    const updated = await prisma.cycleCounts.update({
      where: { CycleCountId: id },
      data: {
        Status: "Reconciled",
        ReconciledDate: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Cycle count reconciled. Inventory adjusted.",
      data: { cycleCountId: updated.CycleCountId, status: updated.Status },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
