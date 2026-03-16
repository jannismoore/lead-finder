import { NextRequest, NextResponse } from "next/server";
import { suggestLeadFields, type ActorSummary } from "@/lib/ai/campaign-planner";
import type { AIProvider } from "@/lib/ai/provider";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { description, actors } = body as {
    description: string;
    actors: ActorSummary[];
  };

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }
  if (!actors?.length) {
    return NextResponse.json({ error: "At least one actor is required" }, { status: 400 });
  }

  const db = getDb();
  const setting = db.select().from(settings).where(eq(settings.key, "ai_provider")).get();
  const provider: AIProvider = setting?.value === "anthropic" ? "anthropic" : "openai";

  try {
    const leadFields = await suggestLeadFields(description, actors, provider);
    return NextResponse.json({ leadFields });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
