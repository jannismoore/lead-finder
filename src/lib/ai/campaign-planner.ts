import { generateCompletion, logLlmCost, type AIProvider } from "./provider";

export interface AgencyProfile {
  agencyName?: string;
  agencyDescription?: string;
  agencyServices?: string;
  agencyResults?: string;
  agencyTargetIndustries?: string;
  agencyWebsite?: string;
}

export interface KpiSuggestion {
  id: string;
  label: string;
  type: "boolean" | "text";
  description?: string;
}

export interface ActorInputSummary {
  id: string;
  name: string;
  phase: "find" | "enrich";
  fields: { key: string; label: string; type: string; helpText?: string }[];
}

export interface LeadFieldSuggestion {
  id: string;
  label: string;
  type: "text" | "number" | "boolean" | "url";
  description?: string;
}

export interface CampaignPlan {
  targetNiche: string;
  suggestedSearchTerms: string[];
  suggestedActorConfigs: Record<string, Record<string, string>>;
  scheduleFrequency: "once" | "daily" | "weekly";
  autoEnrich: boolean;
  reasoning: string;
  suggestedKpis: KpiSuggestion[];
}

function buildAgencyContext(agency: AgencyProfile): string {
  const parts: string[] = [];
  if (agency.agencyName) parts.push(`Agency: ${agency.agencyName}`);
  if (agency.agencyDescription) parts.push(`About: ${agency.agencyDescription}`);
  if (agency.agencyServices) parts.push(`Services offered: ${agency.agencyServices}`);
  if (agency.agencyResults) parts.push(`Results & case studies: ${agency.agencyResults}`);
  if (agency.agencyTargetIndustries) parts.push(`Target industries: ${agency.agencyTargetIndustries}`);
  if (parts.length === 0) return "";
  return `\n\nAGENCY CONTEXT (use this to make KPIs relevant to what this agency sells):\n${parts.join("\n")}`;
}

export async function planCampaign(
  description: string,
  provider: AIProvider,
  agencyProfile?: AgencyProfile,
  actors?: ActorInputSummary[]
): Promise<CampaignPlan> {
  const agencyContext = agencyProfile ? buildAgencyContext(agencyProfile) : "";

  let actorContext = "";
  if (actors && actors.length > 0) {
    const actorLines = actors.map((a) => {
      const fieldDescs = a.fields.map((f) => `    - ${f.key} (${f.type}): ${f.label}${f.helpText ? ` — ${f.helpText}` : ""}`).join("\n");
      return `  ${a.id} [${a.name}] (phase: ${a.phase})\n${fieldDescs || "    (no configurable fields)"}`;
    }).join("\n");
    actorContext = `\n\nAVAILABLE ACTORS AND THEIR INPUT FIELDS:\n${actorLines}\n\nFor "suggestedActorConfigs", map each actor's input fields to appropriate values based on the campaign description. For search/query fields use the generated search terms (comma-separated for string-array fields). For numeric limit fields, suggest sensible defaults. For boolean fields, set true/false based on the campaign needs. Only include actors that are relevant to the campaign. Values must be strings (arrays as comma-separated, booleans as "true"/"false", numbers as digit strings).`;
  }

  const systemPrompt = `You are a campaign planning assistant for a lead-finding tool. Given a user's natural language description of what leads they want to find, you analyze the request and extract structured campaign metadata.

You do NOT select tools/actors — the user will choose those manually. Your job is to:
1. Identify the target niche
2. Generate high-quality search terms the user can apply to whichever discovery tools they pick
3. Pre-fill actor input fields with appropriate values based on the campaign description
4. Recommend a schedule
5. Suggest 4-8 KPIs (key performance indicators) to track for each lead during enrichment
6. Explain your reasoning briefly

Rules for search terms:
- Generate 3-8 specific, realistic search queries based on what the user described
- Always include the business type AND location in each term (e.g., "dentist in Miami FL", "HVAC companies Dallas TX")
- If the user mentions multiple business types or locations, create combinations
- Make terms specific enough to find the right businesses, not too broad
- These terms will be used in Google Maps and Google Search scrapers

Rules for KPIs:
- Suggest 4-8 KPIs that help identify leads most likely to buy the agency's services
- KPIs should focus on signals that indicate whether the lead would benefit from what the agency specifically offers — they should help identify selling opportunities, not just general business metrics
- Each KPI has: id (snake_case identifier), label (human-readable), type ("boolean" for yes/no flags, "text" for free-form values), and optional description
- Mix boolean and text types — booleans for concrete presence/absence checks (e.g. "has_online_booking", "uses_voicemail"), text for qualitative assessments (e.g. "current_phone_handling", "website_quality")
- If agency context is provided, tailor KPIs to the agency's services
- If no agency context is available, suggest general business-fit KPIs for the niche${agencyContext}${actorContext}

Output ONLY valid JSON with this exact structure, no markdown fences:
{
  "targetNiche": "extracted niche from description",
  "suggestedSearchTerms": ["specific search term 1", "specific search term 2"],
  "suggestedActorConfigs": {"actorId": {"fieldName": "value"}},
  "scheduleFrequency": "once",
  "autoEnrich": true,
  "reasoning": "Brief explanation of your analysis and why you chose these search terms",
  "suggestedKpis": [{"id": "kpi_id", "label": "KPI Label", "type": "boolean", "description": "optional description"}]
}`;

  const response = await generateCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: description },
    ],
    provider,
    { temperature: 0.2, maxTokens: 2048 }
  );

  logLlmCost(response, "campaign-planning");

  try {
    const cleaned = response.content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned) as CampaignPlan;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`AI returned invalid JSON: ${response.content.substring(0, 200)}`);
    }
    throw err;
  }
}

export interface ActorSummary {
  id: string;
  name: string;
  phase: "find" | "enrich";
  description: string;
}

/**
 * Suggests dynamic lead fields based on campaign description and selected actors.
 * Returns only field definitions — no output mappings (AI handles mapping at runtime).
 */
export async function suggestLeadFields(
  description: string,
  actors: ActorSummary[],
  provider: AIProvider
): Promise<LeadFieldSuggestion[]> {
  const actorLines = actors.map((a) =>
    `  ${a.id} [${a.name}] (phase: ${a.phase}): ${a.description}`
  ).join("\n");

  const systemPrompt = `You are a data modelling expert for a lead-finding tool. Given a campaign description and the actors (scrapers) that will be used, determine which dynamic lead fields should be tracked.

Core static fields are always available: displayName, email, website, phone.
Do NOT suggest those.

Your job is to suggest 3-10 additional dynamic fields that would be useful for this specific campaign, based on what the scrapers can output and what would be valuable to track.

Each field needs:
- id: camelCase identifier
- label: human-readable column header
- type: "text", "number", "boolean", or "url"
- description: brief explanation of what this field captures

ACTORS:
${actorLines}

Output ONLY valid JSON array, no markdown fences:
[{"id": "fieldId", "label": "Field Label", "type": "text", "description": "What this tracks"}]`;

  const response = await generateCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Campaign description: ${description}` },
    ],
    provider,
    { temperature: 0.2, maxTokens: 1024 }
  );

  logLlmCost(response, "field-suggestion");

  try {
    const cleaned = response.content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`AI returned invalid JSON: ${response.content.substring(0, 200)}`);
    }
    throw err;
  }
}
