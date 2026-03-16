import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  campaigns,
  leads,
  apifyRuns,
  leadPersonalization,
  analyticsEvents,
  llmCosts,
} from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, parseInt(id))).get();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const campaignLeads = db.select().from(leads).where(eq(leads.campaignId, campaign.id)).all();
  const runs = db.select().from(apifyRuns).where(eq(apifyRuns.campaignId, campaign.id)).all();

  const apifyCost = runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const llmLeadCost = campaignLeads.reduce((s, l) => s + ((l.llmCostUsd as number) ?? 0), 0);
  const llmMiscCost =
    db.select({ total: sql<number>`COALESCE(SUM(${llmCosts.costUsd}), 0)` })
      .from(llmCosts).where(eq(llmCosts.campaignId, campaign.id)).get()?.total ?? 0;
  const campaignLlmCost = llmLeadCost + llmMiscCost;

  const enrichedLeads = campaignLeads.filter((l) => l.status !== "new" && l.status !== "enriching");

  const avgDiscoveryCost = campaignLeads.length > 0
    ? campaignLeads.reduce((s, l) => s + (l.discoveryLlmCostUsd ?? 0) + (l.discoveryApifyCostUsd ?? 0), 0) / campaignLeads.length
    : 0;

  const avgEnrichmentCost = enrichedLeads.length > 0
    ? enrichedLeads.reduce((s, l) => {
        const enrichLlm = ((l.llmCostUsd as number) ?? 0) - (l.discoveryLlmCostUsd ?? 0);
        const enrichApify = (l.apifyCostUsd ?? 0) - (l.discoveryApifyCostUsd ?? 0);
        return s + enrichLlm + enrichApify;
      }, 0) / enrichedLeads.length
    : 0;

  const totalCost = apifyCost + campaignLlmCost;

  const stats = {
    totalLeads: campaignLeads.length,
    qualifiedLeads: campaignLeads.filter((l) => l.status === "qualified").length,
    convertedLeads: campaignLeads.filter((l) => l.status === "converted").length,
    enrichedLeads: enrichedLeads.length,
    avgScore: campaignLeads.length > 0
      ? Math.round(campaignLeads.reduce((s, l) => s + (l.score ?? 0), 0) / campaignLeads.length)
      : 0,
    apifyCost: Math.round(apifyCost * 10000) / 10000,
    llmCost: Math.round(campaignLlmCost * 10000) / 10000,
    totalCost: Math.round(totalCost * 10000) / 10000,
    avgCostPerLead: campaignLeads.length > 0
      ? Math.round((totalCost / campaignLeads.length) * 10000) / 10000
      : 0,
    avgDiscoveryCost: Math.round(avgDiscoveryCost * 10000) / 10000,
    avgEnrichmentCost: Math.round(avgEnrichmentCost * 10000) / 10000,
  };

  return NextResponse.json({ ...campaign, leads: campaignLeads, runs, stats });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  db.update(campaigns)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(campaigns.id, parseInt(id)))
    .run();

  const updated = db.select().from(campaigns).where(eq(campaigns.id, parseInt(id))).get();
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignId = parseInt(id);
  const db = getDb();

  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const campaignLeadIds = db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.campaignId, campaignId))
    .all()
    .map((l) => l.id);

  if (campaignLeadIds.length > 0) {
    db.delete(leadPersonalization).where(inArray(leadPersonalization.leadId, campaignLeadIds)).run();
  }
  db.delete(analyticsEvents).where(eq(analyticsEvents.campaignId, campaignId)).run();
  db.delete(apifyRuns).where(eq(apifyRuns.campaignId, campaignId)).run();
  db.delete(leads).where(eq(leads.campaignId, campaignId)).run();
  db.delete(campaigns).where(eq(campaigns.id, campaignId)).run();

  return NextResponse.json({ success: true });
}
