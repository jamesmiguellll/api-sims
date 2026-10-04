import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || file.size === 0) {
      return NextResponse.json({ message: "No file uploaded." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ message: "Image file size cannot exceed 10MB." }, { status: 400 });
    }

    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    const extension = path.extname(file.name).toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      return NextResponse.json({ message: "Invalid file type. Only JPG, JPEG, PNG, and WEBP are allowed." }, { status: 400 });
    }

    const product = await prisma.finishedProducts.findUnique({ where: { ProductId: id } });
    if (!product) {
      return NextResponse.json({ message: "Product not found." }, { status: 404 });
    }

    const uploadsFolder = path.join(process.cwd(), "public", "uploads", "products");
    if (!fs.existsSync(uploadsFolder)) {
      fs.mkdirSync(uploadsFolder, { recursive: true });
    }

    const uniqueFileName = `${crypto.randomUUID()}_${file.name}`;
    const filePath = path.join(uploadsFolder, uniqueFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);




  } catch (error: any) {
    console.error("Error uploading image:", error);
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
}
