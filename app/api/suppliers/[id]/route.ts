import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const supplier = await prisma.suppliers.findUnique({
      where: { SupplierId: id },
      include: {
        SupplierItems: { include: { Items: true } }
      }
    });

    if (!supplier) {
      return NextResponse.json({ success: false, message: "Supplier not found" }, { status: 404 });
    }

    const response = {
      supplierId: supplier.SupplierId,
      supplierCode: supplier.SupplierCode,
      companyName: supplier.CompanyName,
      contactPerson: supplier.ContactPerson,
      email: supplier.Email,
      phone: supplier.Phone,
      address: supplier.Address,
      website: supplier.Website,
      isActive: supplier.IsActive,
      suppliedItems: supplier.SupplierItems.map(si => ({
        itemId: si.ItemId,
        itemName: si.Items?.ItemName || ""
      }))
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error: any) {
    console.error("Error fetching supplier:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const supplier = await prisma.suppliers.findUnique({
      where: { SupplierId: id },
    });

    if (!supplier) {
      return NextResponse.json({ success: false, message: "Supplier not found" }, { status: 404 });
    }

    if (body.companyName !== undefined) {
      if (!body.companyName.trim() || body.companyName.trim().length > 50) {
        return NextResponse.json({ success: false, message: "Supplier Name cannot exceed 50 characters." }, { status: 400 });
      }
      
      const supplierExists = await prisma.suppliers.findFirst({
        where: { CompanyName: { equals: body.companyName.trim(), mode: "insensitive" }, SupplierId: { not: id } }
      });
      if (supplierExists) {
        return NextResponse.json({ success: false, message: "A supplier with this name already exists." }, { status: 400 });
      }
    }

    if (body.contactPerson !== undefined) {
      if (!body.contactPerson.trim() || body.contactPerson.trim().length > 50) {
        return NextResponse.json({ success: false, message: "Contact Person cannot exceed 50 characters." }, { status: 400 });
      }
      if (/\d/.test(body.contactPerson)) {
        return NextResponse.json({ success: false, message: "Contact Person cannot contain numbers." }, { status: 400 });
      }
    }

    if (body.email !== undefined) {
      if (body.email.length > 50 || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(body.email)) {
        return NextResponse.json({ success: false, message: "Invalid email format (max 50 characters)." }, { status: 400 });
      }
    }

    if (body.phone !== undefined) {
      if (body.phone.length > 50 || !/^[\+\d\s\-]{7,20}$/.test(body.phone)) {
        return NextResponse.json({ success: false, message: "Invalid phone number format." }, { status: 400 });
      }
    }

    if (body.address !== undefined) {
      if (!body.address.trim() || body.address.length > 100) {
        return NextResponse.json({ success: false, message: "Address cannot exceed 100 characters." }, { status: 400 });
      }
    }

    if (body.website !== undefined && body.website.length > 50) {
      return NextResponse.json({ success: false, message: "Website cannot exceed 50 characters." }, { status: 400 });
    }

    const updateData: any = {
      CompanyName: body.companyName !== undefined ? body.companyName : undefined,
      ContactPerson: body.contactPerson !== undefined ? body.contactPerson : undefined,
      Email: body.email !== undefined ? body.email : undefined,
      Phone: body.phone !== undefined ? body.phone : undefined,
      Address: body.address !== undefined ? body.address : undefined,
      Website: body.website !== undefined ? body.website : undefined,
      IsActive: body.isActive !== undefined ? body.isActive : undefined,
    };

    if (body.suppliedItemIds) {
      await prisma.supplierItems.deleteMany({ where: { SupplierId: id } });
      const items = await prisma.items.findMany({ where: { ItemId: { in: body.suppliedItemIds } } });
      
      await prisma.suppliers.update({
        where: { SupplierId: id },
        data: {
          ...updateData,
          SupplierItems: {
            create: items.map(item => ({
              ItemId: item.ItemId,
              PurchaseUomId: item.UomId,
              UnitPrice: 0,
              PackSize: 1
            }))
          }
        }
      });
    } else {
      await prisma.suppliers.update({
        where: { SupplierId: id },
        data: updateData
      });
    }

    const updatedSupplier = await prisma.suppliers.findUnique({
      where: { SupplierId: id },
      include: {
        SupplierItems: { include: { Items: true } }
      }
    });

    const response = {
      supplierId: updatedSupplier!.SupplierId,
      supplierCode: updatedSupplier!.SupplierCode,
      companyName: updatedSupplier!.CompanyName,
      contactPerson: updatedSupplier!.ContactPerson,
      email: updatedSupplier!.Email,
      phone: updatedSupplier!.Phone,
      address: updatedSupplier!.Address,
      website: updatedSupplier!.Website,
      isActive: updatedSupplier!.IsActive,
      suppliedItems: updatedSupplier!.SupplierItems.map(si => ({
        itemId: si.ItemId,
        itemName: si.Items?.ItemName || ""
      }))
    };

    return NextResponse.json({ success: true, message: "Supplier updated successfully", data: response });
  } catch (error: any) {
    console.error("Error updating supplier:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    
    const supplier = await prisma.suppliers.findUnique({
      where: { SupplierId: id },
    });

    if (!supplier) {
      return NextResponse.json({ success: false, message: "Supplier not found." }, { status: 404 });
    }

    await prisma.supplierItems.deleteMany({ where: { SupplierId: id } });
    await prisma.suppliers.delete({ where: { SupplierId: id } });

    return NextResponse.json({ success: true, message: "Supplier deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting supplier:", error);
    return NextResponse.json({ success: false, message: `An error occurred: ${error.message}` }, { status: 500 });
  }
}
