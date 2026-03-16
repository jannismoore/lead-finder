import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { campaigns, leads, settings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { enrichCampaignLeads, cancelEnrichment } from "@/lib/enrichment/pipeline";
import type { AIProvider } from "@/lib/ai/provider";
import { leadEmitter } from "@/lib/events/emitter";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignId = parseInt(id);

  let manual = false;
  let enrichAll = false;
  try {
    const body = await req.json();
    manual = !!body.manual;
    enrichAll = !!body.enrichAll;
  } catch {
    // no body or invalid JSON — default to non-manual
  }

  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let concurrency = (campaign as { enrichmentConcurrency?: number }).enrichmentConcurrency || 0;
  if (concurrency <= 0) {
    const globalSetting = db.select().from(settings).where(eq(settings.key, "enrichment_concurrency")).get();
    concurrency = globalSetting ? parseInt(globalSetting.value) || 1 : 1;
  }

  try {
    const result = await enrichCampaignLeads(
      campaignId,
      null,
      campaign.aiProvider as AIProvider,
      { manual, batchSize: enrichAll ? 9999 : 1, concurrency }
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignId = parseInt(id);
  const db = getDb();

  cancelEnrichment(campaignId);

  const enrichingLeads = db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.campaignId, campaignId), eq(leads.status, "enriching")))
    .all();

  const result = db
    .update(leads)
    .set({ status: "new" })
    .where(and(eq(leads.campaignId, campaignId), eq(leads.status, "enriching")))
    .run();

  for (const lead of enrichingLeads) {
    leadEmitter.emit("lead:status-changed", {
      leadId: lead.id,
      campaignId,
      status: "new",
    });
  }

  return NextResponse.json({ reset: result.changes });
}
