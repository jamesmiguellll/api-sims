import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const stockIn = await prisma.stockIns.findUnique({
      where: { StockInId: id },
    });

    if (!stockIn) {
      return NextResponse.json({ success: false, message: `Stock-In ${id} not found.` }, { status: 404 });
    }

    if (stockIn.Status !== "Approved") {
      return NextResponse.json({ success: false, message: `Only Stock-Ins in Approved status can be committed. Current status: ${stockIn.Status}.` }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Advance Stock-In status
      const result = await tx.stockIns.update({
        where: { StockInId: id },
        data: {
          Status: "Committed",
          CommittedBy: "System User",
          CommittedAt: new Date(),
          Notes: body.notes ? (stockIn.Notes ? `${stockIn.Notes}\nCommit Note: ${body.notes}` : `Commit Note: ${body.notes}`) : stockIn.Notes,
        }
      });

      // 2. Mark all lines as committed
      await tx.stockInLines.updateMany({
        where: { StockInId: id },
        data: {
          CommittedToInventory: true,
        }
      });
      
      // In a real application, you would also create InventoryLots and InventoryLedger entries here.

      return result;
    });

    return NextResponse.json({ success: true, data: updated, message: "Stock-In committed successfully." });
  } catch (error: any) {
    console.error("Error committing Stock-In:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
