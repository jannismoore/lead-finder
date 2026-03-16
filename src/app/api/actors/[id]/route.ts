import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { customActors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = parseInt(id);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const db = getDb();

  const existing = db.select().from(customActors).where(eq(customActors.id, numericId)).get();
  if (!existing) {
    return NextResponse.json({ error: "Actor not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  const allowedFields = [
    "name", "phase", "description", "requiredInputFields",
    "inputFieldDescriptions", "defaultInput", "pageLimitKey",
    "isEnabled",
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  db.update(customActors).set(updates).where(eq(customActors.id, numericId)).run();

  const updated = db.select().from(customActors).where(eq(customActors.id, numericId)).get();
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = parseInt(id);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = getDb();

  const existing = db.select().from(customActors).where(eq(customActors.id, numericId)).get();
  if (!existing) {
    return NextResponse.json({ error: "Actor not found" }, { status: 404 });
  }

  db.delete(customActors).where(eq(customActors.id, numericId)).run();
  return NextResponse.json({ success: true });
}
