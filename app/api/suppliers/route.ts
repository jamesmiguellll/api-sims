import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierName = searchParams.get("supplierName") || "";
    const isActiveParam = searchParams.get("isActive");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));

    const where: any = {};
    if (isActiveParam !== null && isActiveParam !== "") {
      where.IsActive = isActiveParam.toLowerCase() === "true";
    }

    if (supplierName) {
      const lowerSearch = supplierName.toLowerCase();
      where.OR = [
        { CompanyName: { contains: lowerSearch, mode: "insensitive" } },
        { SupplierCode: { contains: lowerSearch, mode: "insensitive" } },
        { ContactPerson: { contains: lowerSearch, mode: "insensitive" } },
        { Email: { contains: lowerSearch, mode: "insensitive" } },
      ];
      if (!isNaN(Number(lowerSearch))) {
        where.OR.push({ SupplierId: Number(lowerSearch) });
      }
    }

    const totalCount = await prisma.suppliers.count({ where });

    const suppliers = await prisma.suppliers.findMany({
      where,
      include: {
        SupplierItems: {
          include: { Items: true }
        }
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const items = suppliers.map((s) => ({
      supplierId: s.SupplierId,
      supplierCode: s.SupplierCode,
      companyName: s.CompanyName,
      contactPerson: s.ContactPerson,
      email: s.Email,
      phone: s.Phone,
      address: s.Address,
      website: s.Website,
      isActive: s.IsActive,
      suppliedItems: s.SupplierItems.map((si) => ({
        itemId: si.ItemId,
        itemName: si.Items?.ItemName || "",
      }))
    }));

    return NextResponse.json({
      success: true,
      data: {
        items,
        totalCount,
        page,
        pageSize
      }
    });
  } catch (error: any) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.companyName?.trim() || body.companyName.trim().length > 50) {
      return NextResponse.json({ success: false, message: "Supplier Name is required and cannot exceed 50 characters." }, { status: 400 });
    }
    if (!body.contactPerson?.trim() || body.contactPerson.trim().length > 50) {
      return NextResponse.json({ success: false, message: "Contact Person is required and cannot exceed 50 characters." }, { status: 400 });
    }
    if (/\d/.test(body.contactPerson)) {
      return NextResponse.json({ success: false, message: "Contact Person cannot contain numbers." }, { status: 400 });
    }
    if (!body.email?.trim() || body.email.length > 50 || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(body.email)) {
      return NextResponse.json({ success: false, message: "Invalid email format (max 50 characters)." }, { status: 400 });
    }
    if (!body.phone?.trim() || body.phone.length > 50 || !/^[\+\d\s\-]{7,20}$/.test(body.phone)) {
      return NextResponse.json({ success: false, message: "Invalid phone number format." }, { status: 400 });
    }
    if (!body.address?.trim() || body.address.length > 100) {
      return NextResponse.json({ success: false, message: "Address is required and cannot exceed 100 characters." }, { status: 400 });
    }
    if (body.website?.trim() && body.website.length > 50) {
      return NextResponse.json({ success: false, message: "Website cannot exceed 50 characters." }, { status: 400 });
    }

    const supplierExists = await prisma.suppliers.findFirst({
      where: { CompanyName: { equals: body.companyName.trim(), mode: "insensitive" } }
    });
    if (supplierExists) {
      return NextResponse.json({ success: false, message: "A supplier with this name already exists." }, { status: 400 });
    }

    const year = new Date().getFullYear();
    const seq = await prisma.documentSequences.upsert({
      where: { DocType_Year: { DocType: "Supplier", Year: year } },
      update: { LastNumber: { increment: 1 } },
      create: { DocType: "Supplier", Year: year, LastNumber: 1 },
    });
    const supplierCode = `SUP-${year}-${String(seq.LastNumber).padStart(4, '0')}`;

    let supplierItemsData: any[] = [];
    if (body.suppliedItemIds && Array.isArray(body.suppliedItemIds) && body.suppliedItemIds.length > 0) {
      const items = await prisma.items.findMany({
        where: { ItemId: { in: body.suppliedItemIds } }
      });
      supplierItemsData = items.map(item => ({
        ItemId: item.ItemId,
        PurchaseUomId: item.UomId,
        UnitPrice: 0,
        PackSize: 1
      }));
    }

    const newSupplier = await prisma.suppliers.create({
      data: {
        SupplierCode: supplierCode,
        CompanyName: body.companyName,
        ContactPerson: body.contactPerson,
        Email: body.email,
        Phone: body.phone,
        Address: body.address,
        Website: body.website || "",
        IsActive: body.isActive ?? true,
        SupplierItems: {
          create: supplierItemsData
        }
      },
      include: {
        SupplierItems: { include: { Items: true } }
      }
    });

    const response = {
      supplierId: newSupplier.SupplierId,
      supplierCode: newSupplier.SupplierCode,
      companyName: newSupplier.CompanyName,
      contactPerson: newSupplier.ContactPerson,
      email: newSupplier.Email,
      phone: newSupplier.Phone,
      address: newSupplier.Address,
      website: newSupplier.Website,
      isActive: newSupplier.IsActive,
      suppliedItems: newSupplier.SupplierItems.map(si => ({
        itemId: si.ItemId,
        itemName: si.Items?.ItemName || ""
      }))
    };

    return NextResponse.json({ success: true, message: "Supplier created successfully", data: response });
  } catch (error: any) {
    console.error("Error creating supplier:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
