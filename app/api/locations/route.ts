import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const locations = await prisma.locations.findMany({
      where: { IsActive: true },
      orderBy: { LocationName: "asc" },
    });

    const data = locations.map((loc) => ({
      locationId: loc.LocationId,
      locationName: loc.LocationName,
      locationType: loc.LocationType,
      status: loc.Status,
      address: loc.Address,
      isSystemLocation: loc.IsSystemLocation,
      parentLocationId: loc.ParentLocationId ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const loc = await prisma.locations.create({
      data: {
        LocationName: body.locationName,
        LocationType: body.locationType ?? "Warehouse",
        Status: body.status ?? "Active",
        Address: body.address ?? "",
        IsActive: true,
        IsSystemLocation: false,
        ParentLocationId: body.parentLocationId ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Location created.",
      data: {
        locationId: loc.LocationId,
        locationName: loc.LocationName,
        locationType: loc.LocationType,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
