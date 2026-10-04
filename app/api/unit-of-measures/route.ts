export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.unitOfMeasures.findMany({
      orderBy: [
        { UomType: "asc" },
        { Name: "asc" },
      ],
      select: {
        UomId: true,
        Code: true,
        Name: true,
        Abbreviation: true,
        UomType: true,
        ConversionFactor: true,
      },
    });

    // Prisma returns Decimal types as Prisma.Decimal objects, which Next.js will convert to strings or objects in JSON.
    // It's safest to serialize them as numbers.
    const units = rows.map((u) => ({
      uomId: u.UomId,
      code: u.Code,
      name: u.Name,
      abbreviation: u.Abbreviation,
      uomType: u.UomType,
      conversionFactor: Number(u.ConversionFactor),
    }));

    return NextResponse.json({
      success: true,
      message: "Successfully retrieved unit of measures.",
      data: units,
    });
  } catch (error) {
    console.error("Error fetching unit of measures:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error.", data: null },
      { status: 500 }
    );
  }
}
