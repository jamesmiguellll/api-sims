import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.findUnique({
      where: { DocType_Year: { DocType: "Recipe", Year: year } },
    });

    const nextNumber = (seq?.LastNumber ?? 0) + 1;
    const nextCode = `BOM-${year}-${String(nextNumber).padStart(4, "0")}`;

    return NextResponse.json({ success: true, nextCode });
  } catch (error: any) {
    console.error("Error generating next recipe code:", error);
    const fallbackYear = new Date().getFullYear();
    return NextResponse.json({ success: true, nextCode: `BOM-${fallbackYear}-0001` });
  }
}
