import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.findUnique({
      where: { DocType_Year: { DocType: "PurchaseOrder", Year: year } }
    });
    const nextNum = seq ? seq.LastNumber + 1 : 1;
    const poNumber = `PO-${year}-${String(nextNum).padStart(4, '0')}`;

    return NextResponse.json({ success: true, data: poNumber });
  } catch (error: any) {
    console.error("Error fetching next PO number:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
