import { NextRequest, NextResponse } from "next/server";
import { planCampaign, type ActorInputSummary, type AgencyProfile } from "@/lib/ai/campaign-planner";
import type { AIProvider } from "@/lib/ai/provider";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
function loadAgencyProfile(db: ReturnType<typeof getDb>): AgencyProfile {
  const get = (key: string) => db.select().from(settings).where(eq(settings.key, key)).get()?.value || "";
  return {
    agencyName: get("agency_name"),
    agencyDescription: get("agency_description"),
    agencyServices: get("agency_services"),
    agencyResults: get("agency_results"),
    agencyTargetIndustries: get("agency_target_industries"),
    agencyWebsite: get("agency_website"),
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { description, aiProvider, actors } = body as {
    description: string;
    aiProvider?: AIProvider;
    actors?: ActorInputSummary[];
  };

  if (!description?.trim()) {
    return NextResponse.json(
      { error: "Description is required" },
      { status: 400 }
    );
  }

  const db = getDb();

  let provider: AIProvider = "openai";
  if (aiProvider) {
    provider = aiProvider === "anthropic" ? "anthropic" : "openai";
  } else {
    const setting = db.select().from(settings).where(eq(settings.key, "ai_provider")).get();
    if (setting?.value === "anthropic") provider = "anthropic";
  }

  const agencyProfile = loadAgencyProfile(db);

  try {
    const plan = await planCampaign(description, provider, agencyProfile, actors);
    return NextResponse.json(plan);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
