import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { campaigns, settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateCompletion, logLlmCost, type AIProvider } from "@/lib/ai/provider";
import type { KpiDefinition, LeadFieldDefinition } from "@/lib/db/schema";

export interface LeadFilter {
  id: string;
  field: string;
  operator:
    | "eq" | "neq"
    | "gt" | "gte" | "lt" | "lte"
    | "contains" | "not_contains"
    | "exists" | "not_exists"
    | "starts_with" | "ends_with";
  value: string | number | boolean;
  label: string;
}

const CORE_FIELDS = [
  { field: "displayName", type: "text", description: "Lead display name (business or person)" },
  { field: "email", type: "text", description: "Email address" },
  { field: "phone", type: "text", description: "Phone number" },
  { field: "website", type: "text", description: "Website URL" },
  { field: "score", type: "number", description: "Lead quality score (0-100)" },
  { field: "status", type: "enum", description: "Lead status", values: ["new", "enriching", "qualified", "converted", "declined", "archived"] },
];

export async function POST(req: NextRequest) {
  const { query, campaignId } = await req.json();

  if (!query || !campaignId) {
    return NextResponse.json({ error: "query and campaignId are required" }, { status: 400 });
  }

  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const leadFieldDefs = (campaign.leadFieldDefinitions as LeadFieldDefinition[]) || [];
  const kpiDefs = (campaign.kpiDefinitions as KpiDefinition[]) || [];

  const dynamicFieldsDesc = leadFieldDefs.map(
    (f) => `  - "${f.id}" (type: ${f.type}) — ${f.label}${f.description ? `: ${f.description}` : ""}`
  ).join("\n");

  const kpiFieldsDesc = kpiDefs.map(
    (k) => `  - "kpi_${k.id}" (type: ${k.type}) — KPI: ${k.label}${k.description ? `: ${k.description}` : ""}`
  ).join("\n");

  const coreFieldsDesc = CORE_FIELDS.map(
    (f) => `  - "${f.field}" (type: ${f.type})${f.description ? ` — ${f.description}` : ""}${"values" in f ? ` [${(f as { values: string[] }).values.join(", ")}]` : ""}`
  ).join("\n");

  const systemPrompt = `You are a filter generator for a lead management system. Given a natural language query, you must produce a JSON array of filter objects.

Available fields:

CORE FIELDS:
${coreFieldsDesc}

CAMPAIGN-SPECIFIC DYNAMIC FIELDS:
${dynamicFieldsDesc || "  (none)"}

CAMPAIGN KPI FIELDS:
${kpiFieldsDesc || "  (none)"}

Each filter object has this shape:
{
  "id": "<unique short id>",
  "field": "<field name from lists above>",
  "operator": "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "not_contains" | "exists" | "not_exists" | "starts_with" | "ends_with",
  "value": <string, number, or boolean matching the field type>,
  "label": "<short human-readable description>"
}

Rules:
- For text searches, prefer "contains" over "eq" unless exact match is clearly requested.
- For checking if a field has any value, use "exists". For checking it's empty, use "not_exists".
- For status filters, use "eq" with one of the valid enum values.
- For boolean fields, value should be true or false.
- For number comparisons, value should be a number.
- The "label" should be concise and readable, e.g. "Score > 70", "Has email", "City contains LA".
- Generate one filter per distinct condition in the query. Combine multiple conditions when the query implies AND logic.
- If the query is ambiguous, make your best interpretation.
- Output ONLY valid JSON — an array of filter objects. No explanation, no markdown fences.`;

  const providerSetting = db.select().from(settings).where(eq(settings.key, "ai_provider")).get();
  const provider: AIProvider = (providerSetting?.value as AIProvider) || "openai";

  try {
    const response = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      provider,
      { temperature: 0.1, maxTokens: 1024 }
    );

    logLlmCost(response, "ai-filter");

    const cleaned = response.content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const filters: LeadFilter[] = JSON.parse(cleaned);

    if (!Array.isArray(filters)) {
      return NextResponse.json({ error: "AI returned invalid format" }, { status: 500 });
    }

    return NextResponse.json({ filters });
  } catch (err) {
    console.error("AI filter generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate filters", details: String(err) },
      { status: 500 }
    );
  }
}
