import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ISSUANCE_INCLUDE, mapMaterialIssuance } from "../route";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid ID." }, { status: 400 });
  }

  try {
    const issuance = await prisma.materialIssuances.findUnique({
      where: { IssuanceId: id },
      include: ISSUANCE_INCLUDE,
    });

    if (!issuance) {
      return NextResponse.json({ success: false, message: "Material issuance not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: mapMaterialIssuance(issuance) });
  } catch (error: any) {
    console.error("GET /api/material-issuances/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
