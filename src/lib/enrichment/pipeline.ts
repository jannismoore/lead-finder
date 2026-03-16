import { getDb, getAgencyType } from "../db";
import { leads, leadPersonalization, campaigns, apifyRuns, type KpiDefinition, type LeadFieldDefinition } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { coerceActorInput } from "../apify/coerce-input";
import { runActorAndCollect } from "../apify/runner";
import { getActorById } from "../apify/registry-server";
import { scoreLead } from "../ai/lead-scorer";
import { extractAllFields } from "../ai/lead-extractor";
import { resolveActorInput } from "../ai/field-resolver";
import type { AIProvider } from "../ai/provider";
import { leadEmitter } from "../events/emitter";

const globalForCancel = globalThis as unknown as { cancelledEnrichments?: Set<number> };
const cancelledEnrichments = globalForCancel.cancelledEnrichments ??= new Set<number>();

export function cancelEnrichment(campaignId: number) {
  cancelledEnrichments.add(campaignId);
}

export async function enrichLead(
  leadId: number,
  _agencyType: string | null,
  aiProvider: AIProvider,
  kpiDefinitions?: KpiDefinition[],
  leadFieldDefs?: LeadFieldDefinition[],
  enrichmentActorIds?: string[]
): Promise<boolean> {
  const agencyType = _agencyType || getAgencyType();
  const db = getDb();
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return false;

  db.update(leads)
    .set({ status: "enriching", updatedAt: new Date().toISOString() })
    .where(eq(leads.id, leadId))
    .run();

  leadEmitter.emit("lead:status-changed", {
    leadId,
    campaignId: lead.campaignId!,
    status: "enriching",
  });

  try {
    const enrichmentActors: string[] = [];
    let mergedEnrichment: Record<string, unknown> = {};
    const perActorEnrichment: Record<string, Record<string, unknown>> = {};

    let totalLlmCost = 0, totalInputTokens = 0, totalOutputTokens = 0;
    let totalApifyCost = 0;

    const actorsToRun = enrichmentActorIds && enrichmentActorIds.length > 0
      ? enrichmentActorIds
      : ["vdrmota/contact-info-scraper"];

    const kpiDefs = kpiDefinitions || [];
    const fieldDefs = leadFieldDefs || [];

    for (const actorId of actorsToRun) {
      const actorDef = getActorById(actorId);
      if (!actorDef || actorDef.phase !== "enrich") continue;

      const currentLead = db.select().from(leads).where(eq(leads.id, leadId)).get()!;

      const allAvailable: Record<string, unknown> = {
        ...(currentLead.website ? { website: currentLead.website } : {}),
        ...(currentLead.email ? { email: currentLead.email } : {}),
        ...(currentLead.phone ? { phone: currentLead.phone } : {}),
        ...((currentLead.rawData as Record<string, unknown>) || {}),
        ...((currentLead.mappedData as Record<string, unknown>) || {}),
        ...mergedEnrichment,
      };

      let resolvedInput: Record<string, unknown> | null = null;
      try {
        const resolveResult = await resolveActorInput(
          actorId,
          actorDef.name,
          actorDef.requiredInputFields || [],
          allAvailable,
          aiProvider
        );
        totalLlmCost += resolveResult.costUsd;
        totalInputTokens += resolveResult.inputTokens;
        totalOutputTokens += resolveResult.outputTokens;

        if (Object.keys(resolveResult.mapping).length > 0) {
          resolvedInput = buildInputFromMapping(currentLead, resolveResult.mapping, allAvailable);
        }
      } catch (err) {
        console.error(`AI input resolution failed for ${actorId}:`, err);
      }

      if (!resolvedInput || Object.keys(resolvedInput).length === 0) continue;

      try {
        const input = coerceActorInput(
          { ...(actorDef.defaultInput || {}), ...resolvedInput },
          actorId
        );
        const result = await runActorAndCollect(actorId, input, lead.campaignId ?? undefined);

        const enrichRun = db.select({ costUsd: apifyRuns.costUsd })
          .from(apifyRuns).where(eq(apifyRuns.runId, result.runId)).get();
        totalApifyCost += enrichRun?.costUsd ?? 0;

        if (result.items.length > 0) {
          enrichmentActors.push(actorId);
          const enriched = result.items[0];
          perActorEnrichment[actorId] = enriched;
          mergedEnrichment = { ...mergedEnrichment, ...enriched };

          const freshLead = db.select().from(leads).where(eq(leads.id, leadId)).get()!;
          const combinedData: Record<string, unknown> = {
            ...((freshLead.rawData as Record<string, unknown>) || {}),
            ...((freshLead.mappedData as Record<string, unknown>) || {}),
            _enrichmentResults: mergedEnrichment,
          };

          const extracted = await extractAllFields(combinedData, fieldDefs, kpiDefs, aiProvider);
          totalLlmCost += extracted.costUsd;
          totalInputTokens += extracted.inputTokens;
          totalOutputTokens += extracted.outputTokens;

          const staticUpdates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
          if (extracted.static.displayName && !freshLead.displayName)
            staticUpdates.displayName = extracted.static.displayName;
          if (extracted.static.email && !freshLead.email)
            staticUpdates.email = extracted.static.email;
          if (extracted.static.website && !freshLead.website)
            staticUpdates.website = extracted.static.website;
          if (extracted.static.phone && !freshLead.phone)
            staticUpdates.phone = extracted.static.phone;

          if (Object.keys(extracted.dynamic).length > 0) {
            const existingMapped = (freshLead.mappedData as Record<string, unknown>) || {};
            staticUpdates.mappedData = { ...existingMapped, ...extracted.dynamic };
          }

          db.update(leads).set(staticUpdates).where(eq(leads.id, leadId)).run();

          if (Object.keys(extracted.kpis).length > 0) {
            const existingPersonalization = db.select().from(leadPersonalization).where(eq(leadPersonalization.leadId, leadId)).get();
            if (existingPersonalization) {
              db.update(leadPersonalization)
                .set({ campaignKpis: extracted.kpis })
                .where(eq(leadPersonalization.id, existingPersonalization.id))
                .run();
            } else {
              db.insert(leadPersonalization).values({ leadId, campaignKpis: extracted.kpis }).run();
            }

            leadEmitter.emit("lead:kpi-updated", {
              leadId,
              campaignId: lead.campaignId!,
              campaignKpis: extracted.kpis,
            });
          }
        }
      } catch (err) {
        console.error(`Enrichment with ${actorId} failed for lead ${leadId}:`, err);
      }
    }

    const leadForScoring = db.select().from(leads).where(eq(leads.id, leadId)).get()!;
    const scoring = await scoreLead(leadForScoring, mergedEnrichment, agencyType, aiProvider);
    totalLlmCost += scoring.costUsd;
    totalInputTokens += scoring.inputTokens;
    totalOutputTokens += scoring.outputTokens;

    // Detect tech stack from enrichment data
    const websiteText = JSON.stringify(mergedEnrichment).toLowerCase();
    const techStack: string[] = [];
    const techIndicators: Record<string, string[]> = {
      WordPress: ["wp-content", "wordpress"],
      Shopify: ["shopify", "myshopify"],
      React: ["react", "_next"],
      Wix: ["wix.com", "wixsite"],
      Squarespace: ["squarespace"],
      HubSpot: ["hubspot", "hs-scripts"],
    };
    for (const [tech, indicators] of Object.entries(techIndicators)) {
      if (indicators.some((i) => websiteText.includes(i))) techStack.push(tech);
    }

    const hasChatbot = websiteText.includes("chat") && (websiteText.includes("widget") || websiteText.includes("bot") || websiteText.includes("intercom") || websiteText.includes("drift") || websiteText.includes("tawk"));
    const hasBooking = websiteText.includes("booking") || websiteText.includes("calendly") || websiteText.includes("appointment") || websiteText.includes("schedule");

    // Save personalization
    const existing = db.select().from(leadPersonalization).where(eq(leadPersonalization.leadId, leadId)).get();

    const personalizationData = {
      leadId,
      websiteTechStack: techStack,
      hasChatbot,
      hasBookingSystem: hasBooking,
      painPoints: scoring.painPoints,
      personalizationSummary: Array.isArray(scoring.personalizationSummary) ? scoring.personalizationSummary.join('\n') : String(scoring.personalizationSummary ?? ''),
      enrichmentActors,
      rawEnrichmentData: perActorEnrichment,
    };

    if (existing) {
      db.update(leadPersonalization)
        .set(personalizationData)
        .where(eq(leadPersonalization.id, existing.id))
        .run();
    } else {
      db.insert(leadPersonalization).values(personalizationData).run();
    }

    const existingLlmCost = (leadForScoring.llmCostUsd ?? 0) as number;
    const existingInputTokens = (leadForScoring.llmInputTokens ?? 0) as number;
    const existingOutputTokens = (leadForScoring.llmOutputTokens ?? 0) as number;
    const existingApifyCost = (leadForScoring.apifyCostUsd ?? 0) as number;

    db.update(leads)
      .set({
        score: scoring.score,
        status: "qualified",
        llmCostUsd: existingLlmCost + totalLlmCost,
        llmInputTokens: existingInputTokens + totalInputTokens,
        llmOutputTokens: existingOutputTokens + totalOutputTokens,
        apifyCostUsd: existingApifyCost + totalApifyCost,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(leads.id, leadId))
      .run();

    leadEmitter.emit("lead:enrichment-completed", {
      leadId,
      campaignId: lead.campaignId!,
      score: scoring.score,
      status: "qualified",
    });

    return true;
  } catch (err) {
    db.update(leads)
      .set({ status: "new", updatedAt: new Date().toISOString() })
      .where(eq(leads.id, leadId))
      .run();
    leadEmitter.emit("lead:status-changed", {
      leadId,
      campaignId: lead.campaignId!,
      status: "new",
    });
    throw err;
  }
}

type LeadForInput = {
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  rawData?: Record<string, unknown> | null;
  mappedData?: Record<string, unknown> | null;
} & Record<string, unknown>;

function buildInputFromMapping(
  lead: LeadForInput,
  inputMapping: Record<string, string>,
  allAvailable?: Record<string, unknown>
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [actorParam, leadFieldKey] of Object.entries(inputMapping)) {
    const value = getLeadFieldValue(lead, leadFieldKey, allAvailable);
    if (value == null || value === "") continue;

    if (actorParam === "usernames") {
      const handle = extractHandle(value);
      if (handle) input.usernames = [handle];
    } else if (actorParam === "startUrls" || actorParam === "startUrl") {
      const url = typeof value === "string" ? value : String(value);
      if (url) input.startUrls = [{ url: url.startsWith("http") ? url : `https://${url}` }];
    } else if (actorParam === "urls") {
      const url = typeof value === "string" ? value : String(value);
      if (url) input.urls = [url.startsWith("http") ? url : `https://${url}`];
    } else {
      input[actorParam] = value;
    }
  }
  return input;
}

function getLeadFieldValue(lead: LeadForInput, key: string, fallback?: Record<string, unknown>): unknown {
  if (key.startsWith("mappedData.")) {
    return (lead.mappedData as Record<string, unknown>)?.[key.slice("mappedData.".length)] ?? null;
  }
  if (key.startsWith("rawData.")) {
    return (lead.rawData as Record<string, unknown>)?.[key.slice("rawData.".length)] ?? null;
  }
  const topLevel = (lead as Record<string, unknown>)[key];
  if (topLevel != null) return topLevel;
  const fromMapped = (lead.mappedData as Record<string, unknown>)?.[key];
  if (fromMapped != null) return fromMapped;
  const fromRaw = (lead.rawData as Record<string, unknown>)?.[key];
  if (fromRaw != null) return fromRaw;
  if (fallback && fallback[key] != null) return fallback[key];
  return null;
}

function extractHandle(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/instagram\.com\/([^/?#]+)/);
  return m ? m[1] : s.replace(/^@/, "");
}

export async function enrichCampaignLeads(
  campaignId: number,
  _agencyType: string | null,
  aiProvider: AIProvider,
  options?: { manual?: boolean; batchSize?: number; concurrency?: number }
): Promise<{ enriched: number; failed: number; skipped: number; remaining: number }> {
  const agencyType = _agencyType || getAgencyType();
  const db = getDb();

  db.update(leads)
    .set({ status: "new", updatedAt: new Date().toISOString() })
    .where(and(
      eq(leads.campaignId, campaignId),
      eq(leads.status, "enriching")
    ))
    .run();

  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  const kpiDefs = (campaign?.kpiDefinitions as KpiDefinition[] | undefined) || [];
  const fieldDefs = (campaign?.leadFieldDefinitions as LeadFieldDefinition[] | undefined) || [];

  const campaignActors = (campaign?.apifyActors as string[] | undefined) || [];
  const disabledActors = new Set<string>(
    (campaign?.actorConfigs as Record<string, unknown>)?._disabledEnrichActors as string[] || []
  );
  const enrichActorIds = campaignActors.filter((id) => {
    const actor = getActorById(id);
    return actor?.phase === "enrich" && !disabledActors.has(id);
  });

  const campaignLeads = db.select().from(leads)
    .where(and(
      eq(leads.campaignId, campaignId),
      eq(leads.status, "new")
    ))
    .all();

  const limit = options?.batchSize ?? 1;
  const concurrency = Math.max(1, options?.concurrency ?? 1);
  const leadsToProcess = campaignLeads.slice(0, limit);
  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < leadsToProcess.length; i += concurrency) {
    if (cancelledEnrichments.has(campaignId)) break;
    if (!options?.manual) {
      const fresh = db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId)).get();
      if (fresh?.status === "paused") break;
    }

    const batch = leadsToProcess.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((lead) => enrichLead(lead.id, agencyType, aiProvider, kpiDefs, fieldDefs, enrichActorIds))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value) enriched++;
        else skipped++;
      } else {
        console.error(`Failed to enrich lead:`, result.reason);
        failed++;
      }
    }

    const remaining = leadsToProcess.length - enriched - skipped - failed;
    leadEmitter.emit("campaign:enrichment-progress", {
      campaignId,
      enriched,
      failed,
      remaining,
    });
  }

  cancelledEnrichments.delete(campaignId);

  const remaining = campaignLeads.length - enriched - skipped - failed;

  return { enriched, failed, skipped, remaining };
}
