import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { leads, campaigns, type KpiDefinition, type LeadFieldDefinition } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { enrichLead } from "@/lib/enrichment/pipeline";
import { getActorById } from "@/lib/apify/registry-server";
import type { AIProvider } from "@/lib/ai/provider";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let requestedActorIds: string[] | undefined;
  try {
    const body = await req.json();
    if (Array.isArray(body.actorIds) && body.actorIds.length > 0) {
      requestedActorIds = body.actorIds;
    }
  } catch {
    // no body or invalid JSON — enrich with all actors
  }

  const db = getDb();
  const lead = db.select().from(leads).where(eq(leads.id, parseInt(id))).get();
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const campaign = lead.campaignId
    ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
    : null;

  const aiProvider = (campaign?.aiProvider || "openai") as AIProvider;

  const kpiDefs = (campaign?.kpiDefinitions as KpiDefinition[] | undefined) || [];
  const leadFieldDefs = (campaign?.leadFieldDefinitions as LeadFieldDefinition[] | undefined) || [];
  const campaignActors = (campaign?.apifyActors as string[] | undefined) || [];
  const disabledActors = new Set<string>(
    (campaign?.actorConfigs as Record<string, unknown>)?._disabledEnrichActors as string[] || []
  );
  const allEnrichActorIds = campaignActors.filter((actorId) => {
    const actor = getActorById(actorId);
    return actor?.phase === "enrich" && !disabledActors.has(actorId);
  });

  const enrichActorIds = requestedActorIds
    ? requestedActorIds.filter((id) => allEnrichActorIds.includes(id))
    : allEnrichActorIds;

  try {
    await enrichLead(lead.id, null, aiProvider, kpiDefs, leadFieldDefs, enrichActorIds);
    const updated = db.select().from(leads).where(eq(leads.id, parseInt(id))).get();
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
