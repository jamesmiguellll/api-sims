import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const products = await prisma.finishedProducts.findMany({
      include: {
        Items: true,
      },
    });

    const response = products.map((fp) => ({
      productId: fp.ProductId,
      itemId: fp.ItemId,
      sellingPrice: Number(fp.SellingPrice),
      sku: fp.Sku,
      itemName: fp.Items?.ItemName || "",
      variant: fp.Variant,
    }));

    return NextResponse.json({ success: true, data: response });
  } catch (error: any) {
    console.error("Error fetching finished products:", error);
    return NextResponse.json(
      { success: false, message: `An error occurred: ${error.message}` },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const trimmedName = body.productName?.trim() || "";

    let existingItem = await prisma.items.findFirst({
      where: { ItemName: { equals: trimmedName, mode: "insensitive" } },
    });

    let item = existingItem;

    if (!item) {
      let category = await prisma.categories.findFirst({
        where: { CategoryName: { contains: "finished good", mode: "insensitive" } },
      });

      if (!category) {
        category = await prisma.categories.create({
          data: { CategoryName: "Finished Good", Description: "Finished Goods" },
        });
      }

      let uom = await prisma.unitOfMeasures.findFirst({
        where: { Abbreviation: "pcs" },
      });
      if (!uom) {
        uom = await prisma.unitOfMeasures.findFirst();
      }

      const year = new Date().getFullYear();
      const seq = await prisma.documentSequences.upsert({
        where: { DocType_Year: { DocType: "Item", Year: year } },
        update: { LastNumber: { increment: 1 } },
        create: { DocType: "Item", Year: year, LastNumber: 1 },
      });
      const itemCode = `SPL-${year}-${String(seq.LastNumber).padStart(4, "0")}`;

      item = await prisma.items.create({
        data: {
          ItemCode: itemCode,
          ItemName: trimmedName,
          UomId: uom?.UomId || 1,
          StockUomId: uom?.UomId || 1,
          CategoryId: category?.CategoryId || 1,
          MinStockLevel: 0,
          MaxStockLevel: 100,
          IsActive: true,
        },
      });
    }

    const newProduct = await prisma.finishedProducts.create({
      data: {
        ItemId: item.ItemId,
        SellingPrice: body.sellingPrice,
        Sku: body.sku || "",
        Variant: body.variant || "",
      },
      include: {
        Items: true,
      }
    });

    const response = {
      productId: newProduct.ProductId,
      itemId: newProduct.ItemId,
      sellingPrice: Number(newProduct.SellingPrice),
      sku: newProduct.Sku,
      itemName: newProduct.Items?.ItemName || "",
      variant: newProduct.Variant,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error: any) {
    console.error("Error creating finished product:", error);
    return NextResponse.json(
      { success: false, message: `An error occurred: ${error.message}` },
      { status: 500 }
    );
  }
}
