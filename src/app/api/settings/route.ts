import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const db = getDb();
  const all = db.select().from(settings).all();
  const masked = all.map((s) => ({
    ...s,
    value: s.key.includes("key") || s.key.includes("token") || s.key.includes("secret")
      ? s.value ? "••••••••" : ""
      : s.value,
  }));
  return NextResponse.json(masked);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { key, value } = body as { key: string; value: string };

  const db = getDb();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();

  if (existing) {
    db.update(settings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(settings.key, key))
      .run();
  } else {
    db.insert(settings).values({ key, value }).run();
  }

  return NextResponse.json({ success: true });
}
