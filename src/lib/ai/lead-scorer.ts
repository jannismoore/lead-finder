import { generateCompletion, type AIProvider } from "./provider";
import type { Lead } from "../db/schema";

interface ScoringResult {
  score: number;
  painPoints: string[];
  personalizationSummary: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export async function scoreLead(
  lead: Lead,
  enrichmentData: Record<string, unknown>,
  agencyType: string,
  provider: AIProvider
): Promise<ScoringResult> {
  const systemPrompt = `You are a lead scoring expert for a ${agencyType} agency. 
Analyze the lead data and return a JSON object with:
- "score": 0-100 integer (how good a fit they are as a client)
- "painPoints": array of 2-4 specific pain points you identified
- "personalizationSummary": 2-3 bullet points summarizing key personalization angles

Scoring criteria:
- 80-100: Perfect fit, clear pain points, likely to convert
- 60-79: Good fit, some indicators of need
- 40-59: Moderate fit, may need more research
- 20-39: Low fit, few indicators
- 0-19: Not a fit

Output ONLY valid JSON. No markdown, no code fences.`;

  const rawData = (lead.rawData as Record<string, unknown>) || {};
  const mappedData = (lead.mappedData as Record<string, unknown>) || {};
  const userPrompt = `Score this lead:

Name: ${lead.displayName || "Unknown"}
Website: ${lead.website || "None"}
Email: ${lead.email || "None"}
Phone: ${lead.phone || "None"}

Raw scraped data:
${JSON.stringify(rawData, null, 2).substring(0, 3000)}

Mapped data:
${JSON.stringify(mappedData, null, 2).substring(0, 1000)}

Enrichment data:
${JSON.stringify(enrichmentData, null, 2).substring(0, 3000)}`;

  const response = await generateCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    provider,
    { temperature: 0.3, maxTokens: 2048 }
  );

  const usage = { costUsd: response.costUsd, inputTokens: response.inputTokens, outputTokens: response.outputTokens };
  try {
    const cleaned = response.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { score: number; painPoints: string[]; personalizationSummary: string };
    return { ...parsed, ...usage };
  } catch {
    return { score: 50, painPoints: [], personalizationSummary: "", ...usage };
  }
}
