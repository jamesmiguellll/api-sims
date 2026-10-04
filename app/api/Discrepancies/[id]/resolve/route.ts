import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const discrepancy = await prisma.discrepancies.findUnique({
      where: { DiscrepancyId: id },
    });

    if (!discrepancy) {
      return NextResponse.json({ success: false, message: `Discrepancy ${id} not found.` }, { status: 404 });
    }

    if (discrepancy.Status === "Resolved" || discrepancy.Status === "Closed") {
      return NextResponse.json({ success: false, message: `Discrepancy is already resolved or closed.` }, { status: 400 });
    }

    const updated = await prisma.discrepancies.update({
      where: { DiscrepancyId: id },
      data: {
        Status: "Resolved",
        ResolutionType: body.resolutionType,
        ResolutionNotes: body.resolutionNotes,
        ResolvedBy: "System User",
        ResolvedAt: new Date(),
      }
    });

    return NextResponse.json({ success: true, data: updated, message: "Discrepancy resolved successfully." });
  } catch (error: any) {
    console.error("Error resolving Discrepancy:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
