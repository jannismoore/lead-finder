import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { leads, campaigns, apifyRuns, analyticsEvents, llmCosts } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

export async function GET() {
  const db = getDb();

  const totalLeads = db.select({ count: sql<number>`count(*)` }).from(leads).get()?.count ?? 0;
  const totalCampaigns = db.select({ count: sql<number>`count(*)` }).from(campaigns).get()?.count ?? 0;
  const activeCampaigns = db.select({ count: sql<number>`count(*)` }).from(campaigns).where(eq(campaigns.status, "active")).get()?.count ?? 0;

  const convertedLeads = db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.status, "converted")).get()?.count ?? 0;
  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  // Leads by source
  const leadsBySource = db
    .select({ source: leads.source, count: sql<number>`count(*)` })
    .from(leads)
    .groupBy(leads.source)
    .all();

  // Leads by status
  const leadsByStatus = db
    .select({ status: leads.status, count: sql<number>`count(*)` })
    .from(leads)
    .groupBy(leads.status)
    .all();

  // Recent activity
  const recentEvents = db
    .select()
    .from(analyticsEvents)
    .orderBy(sql`${analyticsEvents.createdAt} DESC`)
    .limit(20)
    .all();

  const totalApifyCost = db
    .select({ total: sql<number>`COALESCE(SUM(${apifyRuns.costUsd}), 0)` })
    .from(apifyRuns)
    .get()?.total ?? 0;

  const leadLlmCost = db
    .select({ total: sql<number>`COALESCE(SUM(${leads.llmCostUsd}), 0)` })
    .from(leads)
    .get()?.total ?? 0;

  const miscLlmCost = db
    .select({ total: sql<number>`COALESCE(SUM(${llmCosts.costUsd}), 0)` })
    .from(llmCosts)
    .get()?.total ?? 0;

  const totalLlmCost = leadLlmCost + miscLlmCost;

  // Score distribution
  const scoreCaseExpr = sql`CASE 
    WHEN ${leads.score} >= 80 THEN 'Excellent (80-100)'
    WHEN ${leads.score} >= 60 THEN 'Good (60-79)'
    WHEN ${leads.score} >= 40 THEN 'Moderate (40-59)'
    WHEN ${leads.score} >= 20 THEN 'Low (20-39)'
    ELSE 'Very Low (0-19)'
  END`;

  const scoreDistribution = db
    .select({
      bucket: sql<string>`${scoreCaseExpr}`,
      count: sql<number>`count(*)`,
    })
    .from(leads)
    .groupBy(scoreCaseExpr)
    .all();

  return NextResponse.json({
    kpis: {
      totalLeads,
      totalCampaigns,
      activeCampaigns,
      convertedLeads,
      conversionRate,
      totalApifyCost: Math.round(totalApifyCost * 100) / 100,
      totalLlmCost: Math.round(totalLlmCost * 100) / 100,
      totalCost: Math.round((totalApifyCost + totalLlmCost) * 100) / 100,
    },
    leadsBySource,
    leadsByStatus,
    scoreDistribution,
    recentEvents,
  });
}
