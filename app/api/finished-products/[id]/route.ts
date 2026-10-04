import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const product = await prisma.finishedProducts.findUnique({
      where: { ProductId: id },
      include: { Items: true },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Finished product not found." },
        { status: 404 }
      );
    }

    const updatedProduct = await prisma.finishedProducts.update({
      where: { ProductId: id },
      data: {
        Variant: body.variant,
        SellingPrice: body.sellingPrice,
        Sku: body.sku,
        Items: {
          update: {
            ItemName: body.productName,
          }
        }
      },
      include: { Items: true }
    });

    const response = {
      productId: updatedProduct.ProductId,
      itemId: updatedProduct.ItemId,
      sellingPrice: Number(updatedProduct.SellingPrice),
      sku: updatedProduct.Sku,
      itemName: updatedProduct.Items?.ItemName || "",
      variant: updatedProduct.Variant,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error: any) {
    console.error("Error updating finished product:", error);
    return NextResponse.json(
      { success: false, message: `An error occurred: ${error.message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    
    const product = await prisma.finishedProducts.findUnique({
      where: { ProductId: id },
    });

    if (!product) {
      return NextResponse.json(
        { success: false, message: "Finished product variant not found." },
        { status: 404 }
      );
    }

    await prisma.finishedProducts.delete({ where: { ProductId: id } });

    return NextResponse.json({ success: true, data: true });
  } catch (error: any) {
    console.error("Error deleting finished product:", error);
    return NextResponse.json(
      { success: false, message: "Cannot delete product variant because it may be referenced in recipes or production batches." },
      { status: 400 }
    );
  }
}
