import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { leads, campaigns, apifyRuns, llmCosts } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

export async function GET() {
  const db = getDb();

  const totalApifyCost =
    db.select({ total: sql<number>`COALESCE(SUM(${apifyRuns.costUsd}), 0)` })
      .from(apifyRuns).get()?.total ?? 0;

  const leadLlmCost =
    db.select({ total: sql<number>`COALESCE(SUM(${leads.llmCostUsd}), 0)` })
      .from(leads).get()?.total ?? 0;

  const miscLlmCost =
    db.select({ total: sql<number>`COALESCE(SUM(${llmCosts.costUsd}), 0)` })
      .from(llmCosts).get()?.total ?? 0;

  const totalLlmCost = leadLlmCost + miscLlmCost;
  const totalCost = totalApifyCost + totalLlmCost;

  const leadLlmByProvider = db
    .select({
      provider: campaigns.aiProvider,
      cost: sql<number>`COALESCE(SUM(${leads.llmCostUsd}), 0)`,
      inputTokens: sql<number>`COALESCE(SUM(${leads.llmInputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${leads.llmOutputTokens}), 0)`,
    })
    .from(leads)
    .innerJoin(campaigns, eq(leads.campaignId, campaigns.id))
    .groupBy(campaigns.aiProvider)
    .all();

  const miscLlmByModel = db
    .select({
      provider: llmCosts.provider,
      model: llmCosts.model,
      cost: sql<number>`COALESCE(SUM(${llmCosts.costUsd}), 0)`,
      inputTokens: sql<number>`COALESCE(SUM(${llmCosts.inputTokens}), 0)`,
      outputTokens: sql<number>`COALESCE(SUM(${llmCosts.outputTokens}), 0)`,
    })
    .from(llmCosts)
    .groupBy(llmCosts.provider, llmCosts.model)
    .all();

  const providerModelMap: Record<string, string> = {
    openai: "gpt-4o",
    anthropic: "claude-sonnet-4-20250514",
  };

  const byModel: Record<string, { cost: number; inputTokens: number; outputTokens: number }> = {};
  for (const row of leadLlmByProvider) {
    const model = providerModelMap[row.provider ?? "openai"] ?? "unknown";
    if (!byModel[model]) byModel[model] = { cost: 0, inputTokens: 0, outputTokens: 0 };
    byModel[model].cost += row.cost;
    byModel[model].inputTokens += row.inputTokens;
    byModel[model].outputTokens += row.outputTokens;
  }
  for (const row of miscLlmByModel) {
    const model = row.model;
    if (!byModel[model]) byModel[model] = { cost: 0, inputTokens: 0, outputTokens: 0 };
    byModel[model].cost += row.cost;
    byModel[model].inputTokens += row.inputTokens;
    byModel[model].outputTokens += row.outputTokens;
  }

  const allCampaigns = db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).all();
  const byCampaign = allCampaigns.map((c) => {
    const apifyCost =
      db.select({ total: sql<number>`COALESCE(SUM(${apifyRuns.costUsd}), 0)` })
        .from(apifyRuns).where(eq(apifyRuns.campaignId, c.id)).get()?.total ?? 0;

    const llmLeadCost =
      db.select({ total: sql<number>`COALESCE(SUM(${leads.llmCostUsd}), 0)` })
        .from(leads).where(eq(leads.campaignId, c.id)).get()?.total ?? 0;

    const llmMiscCost =
      db.select({ total: sql<number>`COALESCE(SUM(${llmCosts.costUsd}), 0)` })
        .from(llmCosts).where(eq(llmCosts.campaignId, c.id)).get()?.total ?? 0;

    const campaignLlmCost = llmLeadCost + llmMiscCost;
    return {
      campaignId: c.id,
      campaignName: c.name,
      apifyCost: round(apifyCost),
      llmCost: round(campaignLlmCost),
      totalCost: round(apifyCost + campaignLlmCost),
    };
  });

  const byOperation = db
    .select({
      operation: llmCosts.operation,
      cost: sql<number>`COALESCE(SUM(${llmCosts.costUsd}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(llmCosts)
    .groupBy(llmCosts.operation)
    .all();

  const recentRuns = db
    .select()
    .from(apifyRuns)
    .orderBy(sql`${apifyRuns.startedAt} DESC`)
    .limit(20)
    .all();

  return NextResponse.json({
    totals: {
      apifyCost: round(totalApifyCost),
      llmCost: round(totalLlmCost),
      totalCost: round(totalCost),
    },
    byModel: Object.entries(byModel).map(([model, data]) => ({
      model,
      cost: round(data.cost),
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
    })),
    byCampaign,
    byOperation: byOperation.map((o) => ({
      operation: o.operation,
      cost: round(o.cost),
      count: o.count,
    })),
    recentRuns: recentRuns.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      campaignId: r.campaignId,
      status: r.status,
      costUsd: r.costUsd ? round(r.costUsd) : null,
      resultCount: r.resultCount,
      startedAt: r.startedAt,
    })),
  });
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
