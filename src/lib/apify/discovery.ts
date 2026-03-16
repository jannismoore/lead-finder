import { getDb } from "../db";
import { leads, campaigns, analyticsEvents, apifyRuns } from "../db/schema";
import { eq } from "drizzle-orm";
import { coerceActorInput } from "./coerce-input";
import { runActorAndCollect, ApifyError } from "./runner";
import { normalizeSingleItem } from "./normalizer";
import { getActorById } from "./registry-server";
import { enrichCampaignLeads } from "../enrichment/pipeline";
import { getDefaultAIProvider, type AIProvider } from "../ai/provider";
import { leadEmitter } from "../events/emitter";

export interface ActorRunResult {
  actorId: string;
  status: "succeeded" | "failed";
  runId?: string;
  totalResults: number;
  inserted: number;
  deduplicated: number;
  error?: string;
  errorType?: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface DiscoveryResult {
  results: ActorRunResult[];
  totalInserted: number;
  totalDeduplicated: number;
}

export async function runSingleActorDiscovery(
  actorId: string,
  input: Record<string, unknown>,
  campaignId: number,
): Promise<ActorRunResult> {
  const db = getDb();
  const coercedInput = coerceActorInput(input, actorId);

  db.insert(analyticsEvents).values({
    eventType: "apify_run_started",
    campaignId,
    metadata: { actorId, input },
  }).run();

  const result = await runActorAndCollect(actorId, coercedInput, campaignId);

  if (result.status !== "SUCCEEDED") {
    return {
      actorId,
      status: "failed",
      runId: result.runId,
      totalResults: 0,
      inserted: 0,
      deduplicated: 0,
      error: `Apify run failed: ${result.status}`,
    };
  }

  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  const provider: AIProvider = (campaign?.aiProvider as AIProvider) ?? getDefaultAIProvider();

  const totalItems = result.items.length;
  let inserted = 0;
  let deduplicated = 0;

  for (let i = 0; i < totalItems; i++) {
    const { lead } = await normalizeSingleItem(actorId, result.items[i], campaignId, result.runId, provider);

    let existing = false;
    if (lead.website) {
      const found = db.select().from(leads).where(eq(leads.website, lead.website)).get();
      if (found) existing = true;
    }
    if (!existing && lead.email) {
      const found = db.select().from(leads).where(eq(leads.email, lead.email)).get();
      if (found) existing = true;
    }

    if (existing) {
      deduplicated++;
      continue;
    }

    const inserted_row = db.insert(leads).values(lead).returning().get();
    inserted++;

    leadEmitter.emit("lead:discovered", {
      leadId: inserted_row.id,
      campaignId,
      displayName: inserted_row.displayName,
      email: inserted_row.email,
      phone: inserted_row.phone,
      website: inserted_row.website,
      status: inserted_row.status,
      rawData: inserted_row.rawData as Record<string, unknown> | null,
      mappedData: inserted_row.mappedData as Record<string, unknown> | null,
      createdAt: inserted_row.createdAt,
      source: actorId,
      index: i + 1,
      totalItems,
    });
  }

  if (inserted > 0) {
    const run = db.select({ costUsd: apifyRuns.costUsd })
      .from(apifyRuns).where(eq(apifyRuns.runId, result.runId)).get();
    const runCost = run?.costUsd ?? 0;
    if (runCost > 0) {
      const perLeadApifyCost = runCost / inserted;
      db.update(leads)
        .set({
          apifyCostUsd: perLeadApifyCost,
          discoveryApifyCostUsd: perLeadApifyCost,
        })
        .where(eq(leads.sourceRunId, result.runId))
        .run();
    }
  }

  db.insert(analyticsEvents).values({
    eventType: "apify_run_completed",
    campaignId,
    metadata: {
      actorId,
      runId: result.runId,
      totalResults: totalItems,
      inserted,
      deduplicated,
    },
  }).run();

  return {
    actorId,
    status: "succeeded",
    runId: result.runId,
    totalResults: totalItems,
    inserted,
    deduplicated,
  };
}

export async function runCampaignDiscovery(campaignId: number): Promise<DiscoveryResult> {
  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) throw new Error("Campaign not found");

  const actorIds = (campaign.apifyActors as string[]) || [];
  const actorConfigs = (campaign.actorConfigs as Record<string, Record<string, unknown>>) || {};

  const results: ActorRunResult[] = [];

  leadEmitter.emit("campaign:discovery-started", {
    campaignId,
    actorIds,
  });

  for (const actorId of actorIds) {
    const actor = getActorById(actorId);
    if (actor?.phase !== "find") continue;

    const input = { ...actorConfigs[actorId] || {} };

    try {
      const result = await runSingleActorDiscovery(actorId, input, campaignId);
      results.push(result);
    } catch (err) {
      if (err instanceof ApifyError) {
        results.push({
          actorId,
          status: "failed",
          totalResults: 0,
          inserted: 0,
          deduplicated: 0,
          error: err.message,
          errorType: err.errorType,
          actionUrl: err.actionUrl,
          actionLabel: err.actionLabel,
        });
      } else {
        results.push({
          actorId,
          status: "failed",
          totalResults: 0,
          inserted: 0,
          deduplicated: 0,
          error: String(err),
        });
      }
    }
  }

  db.update(campaigns)
    .set({
      lastDiscoveryAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(campaigns.id, campaignId))
    .run();

  const totalInserted = totalInsertedSoFar;

  if (campaign.autoEnrich && totalInserted > 0) {
    try {
      const enrichResult = await enrichCampaignLeads(
        campaignId,
        null,
        campaign.aiProvider as AIProvider
      );
      db.insert(analyticsEvents).values({
        eventType: "auto_enrichment_completed",
        campaignId,
        metadata: {
          enriched: enrichResult.enriched,
          failed: enrichResult.failed,
        },
      }).run();
    } catch (err) {
      console.error(`Auto-enrichment failed for campaign ${campaignId}:`, err);
    }
  }

  const allSucceeded = results.every((r) => r.status === "succeeded");
  if (campaign.scheduleFrequency === "once" && allSucceeded) {
    db.update(campaigns)
      .set({ status: "completed", updatedAt: new Date().toISOString() })
      .where(eq(campaigns.id, campaignId))
      .run();
  }

  const totalDeduplicated = results.reduce((s, r) => s + r.deduplicated, 0);

  leadEmitter.emit("campaign:discovery-completed", {
    campaignId,
    totalInserted,
    totalDeduplicated,
  });

  return {
    results,
    totalInserted,
    totalDeduplicated,
  };
}
