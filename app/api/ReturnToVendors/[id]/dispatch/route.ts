import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const rtv = await prisma.returnToVendors.findUnique({
      where: { RtvId: id },
    });

    if (!rtv) {
      return NextResponse.json({ success: false, message: `Return to Supplier (RTV) ${id} not found.` }, { status: 404 });
    }

    if (rtv.Status !== "Approved") {
      return NextResponse.json({ success: false, message: `Only RTVs in Approved status can be dispatched. Current status: ${rtv.Status}.` }, { status: 400 });
    }

    const updated = await prisma.returnToVendors.update({
      where: { RtvId: id },
      data: {
        Status: "Dispatched",
        DispatchedDate: body.dispatchDate ? new Date(body.dispatchDate) : new Date(),
        CreditNoteNumber: body.creditNoteNumber || undefined,
      }
    });

    return NextResponse.json({ success: true, data: updated, message: "RTV dispatched successfully." });
  } catch (error: any) {
    console.error("Error dispatching RTV:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
