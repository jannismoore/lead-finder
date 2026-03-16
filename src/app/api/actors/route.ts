import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { customActors, type NewCustomActor } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const db = getDb();
  const actors = db.select().from(customActors).all();
  return NextResponse.json(actors);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { actorId, name, phase, description, requiredInputFields, inputFieldDescriptions, defaultInput, pageLimitKey } = body;

  if (!actorId || !name || !phase) {
    return NextResponse.json({ error: "actorId, name, and phase are required" }, { status: 400 });
  }

  if (!actorId.includes("/")) {
    return NextResponse.json({ error: "Actor ID must be in format: username/actor-name" }, { status: 400 });
  }

  const db = getDb();

  const existing = db.select().from(customActors).where(eq(customActors.actorId, actorId)).get();
  if (existing) {
    return NextResponse.json({ error: "This actor has already been added" }, { status: 409 });
  }

  const values: NewCustomActor = {
    actorId,
    name,
    phase,
    description: description || null,
    requiredInputFields: requiredInputFields || [],
    inputFieldDescriptions: inputFieldDescriptions || {},
    defaultInput: defaultInput || {},
    pageLimitKey: pageLimitKey || null,
  };

  db.insert(customActors).values(values).run();

  const created = db.select().from(customActors).where(eq(customActors.actorId, actorId)).get();
  return NextResponse.json(created, { status: 201 });
}
