import { generateCompletion, type AIProvider } from "./provider";
import type { LeadFieldDefinition, KpiDefinition } from "../db/schema";
import { extractEmail } from "../utils/email";

export interface CostInfo {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface StaticFields {
  displayName?: string;
  email?: string;
  website?: string;
  phone?: string;
}

export interface StaticFieldsResult extends StaticFields, CostInfo {}

export interface AllFieldsResult {
  static: StaticFields;
  dynamic: Record<string, unknown>;
  kpis: Record<string, boolean | string>;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Small, fast AI completion used on import.
 * Extracts only the 4 static fields from raw scraped data.
 */
export async function extractStaticFields(
  rawData: Record<string, unknown>,
  actorName: string,
  provider: AIProvider
): Promise<StaticFieldsResult> {
  if (!rawData || Object.keys(rawData).length === 0) return { costUsd: 0, inputTokens: 0, outputTokens: 0 };

  const rawStr = JSON.stringify(rawData, null, 2);
  const truncated = rawStr.length > 3000 ? rawStr.substring(0, 3000) + "\n..." : rawStr;

  const systemPrompt = `You are a data extraction expert. Given raw scraped data from "${actorName}", extract the following fields:

- displayName: The primary label for this lead — a business name, person's name, username, or profile name
- email: A valid email address (must contain @)
- website: The main website URL
- phone: A phone number

Rules:
- ONLY return fields you can confidently find in the data
- For email, only return valid-looking addresses
- For website, return the canonical URL (not social profile URLs)
- Look in nested objects, arrays, and fields with non-obvious names
- Output ONLY valid JSON. No markdown, no code fences.`;

  const userPrompt = `Raw scraped data:\n${truncated}`;

  let costUsd = 0, inputTokens = 0, outputTokens = 0;
  try {
    const response = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      provider,
      { temperature: 0.1, maxTokens: 256 }
    );
    costUsd = response.costUsd;
    inputTokens = response.inputTokens;
    outputTokens = response.outputTokens;

    const cleaned = response.content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const result: StaticFieldsResult = { costUsd, inputTokens, outputTokens };

    if (parsed.displayName && typeof parsed.displayName === "string")
      result.displayName = parsed.displayName.trim();
    if (parsed.email && typeof parsed.email === "string" && parsed.email.includes("@"))
      result.email = extractEmail(parsed.email) || undefined;
    if (parsed.website && typeof parsed.website === "string")
      result.website = parsed.website.trim();
    if (parsed.phone && typeof parsed.phone === "string")
      result.phone = parsed.phone.trim();

    return result;
  } catch (err) {
    console.error("extractStaticFields failed:", err);
    return { costUsd, inputTokens, outputTokens };
  }
}

/**
 * Unified AI completion used during enrichment.
 * Extracts static fields, dynamic campaign fields, and KPIs in a single call.
 */
export async function extractAllFields(
  allData: Record<string, unknown>,
  dynamicFieldDefs: LeadFieldDefinition[],
  kpiDefs: KpiDefinition[],
  provider: AIProvider
): Promise<AllFieldsResult> {
  const empty: AllFieldsResult = { static: {}, dynamic: {}, kpis: {}, costUsd: 0, inputTokens: 0, outputTokens: 0 };
  if (!allData || Object.keys(allData).length === 0) return empty;

  const dataStr = JSON.stringify(allData, null, 2);
  const truncated = dataStr.length > 6000 ? dataStr.substring(0, 6000) + "\n..." : dataStr;

  const dynamicFieldLines = dynamicFieldDefs.length > 0
    ? dynamicFieldDefs.map((f) =>
        `  - "${f.id}" (${f.type}): ${f.label}${f.description ? ` — ${f.description}` : ""}`
      ).join("\n")
    : "  (none)";

  const kpiLines = kpiDefs.length > 0
    ? kpiDefs.map((k) =>
        `  - "${k.id}" (${k.type}): ${k.label}${k.description ? ` — ${k.description}` : ""}`
      ).join("\n")
    : "  (none)";

  const systemPrompt = `You are a data extraction expert. Given combined lead data (raw scrape + enrichment results), extract three categories of fields.

1. STATIC FIELDS (always extract these):
- displayName: Primary label — business name, person name, or username
- email: Valid email address (must contain @)
- website: Main website URL (not social profiles)
- phone: Phone number

2. DYNAMIC FIELDS (campaign-specific):
${dynamicFieldLines}

3. KPI FIELDS (campaign indicators):
${kpiLines}

Rules:
- Only return fields you can confidently extract from the data
- For boolean KPIs: use true only when data clearly supports it, default to false
- For text KPIs: use a short extracted string, default to ""
- For dynamic fields: match by semantics — look at both key names AND values in the data
- Look through nested objects, arrays, and enrichment results
- Output ONLY valid JSON with this structure, no markdown:
{"static": {...}, "dynamic": {...}, "kpis": {...}}`;

  const userPrompt = `Combined lead data:\n${truncated}`;

  let costUsd = 0, inputTokens = 0, outputTokens = 0;
  try {
    const response = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      provider,
      { temperature: 0.1, maxTokens: 2048 }
    );
    costUsd = response.costUsd;
    inputTokens = response.inputTokens;
    outputTokens = response.outputTokens;

    const cleaned = response.content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed = JSON.parse(cleaned) as {
      static?: Record<string, unknown>;
      dynamic?: Record<string, unknown>;
      kpis?: Record<string, unknown>;
    };

    const result: AllFieldsResult = { static: {}, dynamic: {}, kpis: {}, costUsd, inputTokens, outputTokens };

    if (parsed.static) {
      const s = parsed.static;
      if (s.displayName && typeof s.displayName === "string")
        result.static.displayName = (s.displayName as string).trim();
      if (s.email && typeof s.email === "string" && (s.email as string).includes("@"))
        result.static.email = extractEmail(s.email as string) || undefined;
      if (s.website && typeof s.website === "string")
        result.static.website = (s.website as string).trim();
      if (s.phone && typeof s.phone === "string")
        result.static.phone = (s.phone as string).trim();
    }

    if (parsed.dynamic && typeof parsed.dynamic === "object") {
      const validIds = new Set(dynamicFieldDefs.map((f) => f.id));
      for (const [key, value] of Object.entries(parsed.dynamic)) {
        if (validIds.has(key) && value != null) {
          result.dynamic[key] = value;
        }
      }
    }

    if (parsed.kpis && typeof parsed.kpis === "object") {
      for (const kpi of kpiDefs) {
        const val = (parsed.kpis as Record<string, unknown>)[kpi.id];
        if (kpi.type === "boolean") {
          result.kpis[kpi.id] = val === true;
        } else {
          result.kpis[kpi.id] = typeof val === "string" ? val : "";
        }
      }
    }

    return result;
  } catch (err) {
    console.error("extractAllFields failed:", err);
    const fallbackKpis: Record<string, boolean | string> = {};
    for (const kpi of kpiDefs) {
      fallbackKpis[kpi.id] = kpi.type === "boolean" ? false : "";
    }
    return { static: {}, dynamic: {}, kpis: fallbackKpis, costUsd, inputTokens, outputTokens };
  }
}
