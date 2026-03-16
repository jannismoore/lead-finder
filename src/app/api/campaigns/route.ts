import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { campaigns, leads, analyticsEvents, apifyRuns, llmCosts } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const db = getDb();
  const all = db.select().from(campaigns).all();

  const enriched = all.map((c) => {
    const leadCount = db
      .select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(eq(leads.campaignId, c.id))
      .get()?.count ?? 0;

    const enrichedCount = db
      .select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(sql`${leads.campaignId} = ${c.id} AND ${leads.status} NOT IN ('new', 'enriching')`)
      .get()?.count ?? 0;

    const avgScore = db
      .select({ avg: sql<number>`COALESCE(ROUND(AVG(${leads.score})), 0)` })
      .from(leads)
      .where(sql`${leads.campaignId} = ${c.id} AND ${leads.status} NOT IN ('new', 'enriching')`)
      .get()?.avg ?? 0;

    const apifyCost = db
      .select({ total: sql<number>`COALESCE(SUM(${apifyRuns.costUsd}), 0)` })
      .from(apifyRuns)
      .where(eq(apifyRuns.campaignId, c.id))
      .get()?.total ?? 0;

    const llmLeadCost = db
      .select({ total: sql<number>`COALESCE(SUM(${leads.llmCostUsd}), 0)` })
      .from(leads)
      .where(eq(leads.campaignId, c.id))
      .get()?.total ?? 0;

    const llmMiscCost = db
      .select({ total: sql<number>`COALESCE(SUM(${llmCosts.costUsd}), 0)` })
      .from(llmCosts)
      .where(eq(llmCosts.campaignId, c.id))
      .get()?.total ?? 0;

    const llmCost = llmLeadCost + llmMiscCost;
    const totalCost = Math.round((apifyCost + llmCost) * 10000) / 10000;
    const avgCostPerLead = leadCount > 0 ? Math.round((totalCost / leadCount) * 10000) / 10000 : 0;

    return { ...c, leadCount, enrichedCount, avgScore, apifyCost: Math.round(apifyCost * 10000) / 10000, llmCost: Math.round(llmCost * 10000) / 10000, totalCost, avgCostPerLead };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  const result = db.insert(campaigns).values({
    name: body.name,
    description: body.description || null,
    targetNiche: body.targetNiche,
    apifyActors: body.apifyActors || [],
    searchParams: body.searchParams || {},
    actorConfigs: body.actorConfigs || {},
    kpiDefinitions: body.kpiDefinitions || [],
    leadFieldDefinitions: body.leadFieldDefinitions || [],
    scheduleFrequency: body.scheduleFrequency || "once",
    aiProvider: body.aiProvider || "openai",
    autoEnrich: body.autoEnrich ?? true,
    status: body.status || "draft",
  }).returning().get();

  db.insert(analyticsEvents).values({
    eventType: "campaign_created",
    campaignId: result.id,
    metadata: { name: result.name },
  }).run();

  return NextResponse.json(result, { status: 201 });
}
