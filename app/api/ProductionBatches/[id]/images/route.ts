import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const id = parseInt(params.id, 10);

    const batch = await prisma.productionBatches.findUnique({ where: { BatchId: id } });
    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ success: false, message: "No file uploaded." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: "File must be under 10 MB." }, { status: 400 });
    }

    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.name).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return NextResponse.json({ success: false, message: "Only JPG, PNG, WEBP images are accepted." }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "batches");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const uniqueName = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(uploadsDir, uniqueName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const imageUrl = `/uploads/batches/${uniqueName}`;

    // Store URL in batch ImageUrl field
    await prisma.productionBatches.update({
      where: { BatchId: id },
      data: { ImageUrl: imageUrl },
    });

    return NextResponse.json({ success: true, imageUrl });
  } catch (error: any) {
    console.error("POST /api/ProductionBatches/[id]/images error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
