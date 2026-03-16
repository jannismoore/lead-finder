import { getActorById } from "./registry-server";
import type { NewLead } from "../db/schema";
import { extractStaticFields } from "../ai/lead-extractor";
import type { AIProvider } from "../ai/provider";

export interface NormalizeResult {
  lead: NewLead;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Normalizes a single raw item into a lead record.
 * Uses AI to extract static fields (displayName, email, website, phone).
 */
export async function normalizeSingleItem(
  actorId: string,
  item: Record<string, unknown>,
  campaignId: number,
  sourceRunId: string,
  provider: AIProvider
): Promise<NormalizeResult> {
  const actor = getActorById(actorId);
  if (!actor) throw new Error(`Unknown actor: ${actorId}`);

  const lead: NewLead = {
    campaignId,
    source: actorId,
    sourceRunId,
    status: "new",
    rawData: item,
  };

  let costUsd = 0, inputTokens = 0, outputTokens = 0;

  try {
    const staticFields = await extractStaticFields(item, actor.name, provider);
    costUsd = staticFields.costUsd;
    inputTokens = staticFields.inputTokens;
    outputTokens = staticFields.outputTokens;
    if (staticFields.displayName) lead.displayName = staticFields.displayName;
    if (staticFields.email) lead.email = staticFields.email;
    if (staticFields.website) {
      try {
        const url = new URL(staticFields.website.startsWith("http") ? staticFields.website : `https://${staticFields.website}`);
        lead.website = url.origin;
      } catch {
        lead.website = staticFields.website;
      }
    }
    if (staticFields.phone) lead.phone = staticFields.phone;
    lead.llmCostUsd = costUsd;
    lead.llmInputTokens = inputTokens;
    lead.llmOutputTokens = outputTokens;
    lead.discoveryLlmCostUsd = costUsd;
  } catch (err) {
    console.error(`Static field extraction failed for item in ${actorId}:`, err);
  }

  return { lead, costUsd, inputTokens, outputTokens };
}

/**
 * Normalizes raw actor results into lead records (batch).
 * Stores rawData as-is and uses a small AI completion to extract static fields.
 */
export async function normalizeActorResults(
  actorId: string,
  items: Record<string, unknown>[],
  campaignId: number,
  sourceRunId: string,
  provider: AIProvider
): Promise<NewLead[]> {
  const results: NewLead[] = [];
  for (const item of items) {
    const { lead } = await normalizeSingleItem(actorId, item, campaignId, sourceRunId, provider);
    results.push(lead);
  }
  return results;
}
