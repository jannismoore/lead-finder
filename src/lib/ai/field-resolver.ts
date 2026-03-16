import { generateCompletion, type AIProvider } from "./provider";

export interface ResolveResult {
  mapping: Record<string, string>;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * AI-based resolution of enrichment actor input parameters from available lead data.
 * This is the primary mechanism for figuring out what data to pass to each enrichment actor.
 */
export async function resolveActorInput(
  actorId: string,
  actorName: string,
  requiredInputHints: string[],
  availableData: Record<string, unknown>,
  provider: AIProvider
): Promise<ResolveResult> {
  const dataSnapshot: Record<string, string> = {};
  for (const [key, value] of Object.entries(availableData)) {
    if (value == null) continue;
    const preview = typeof value === "object" ? JSON.stringify(value).slice(0, 120) : String(value).slice(0, 120);
    dataSnapshot[key] = preview;
  }

  if (Object.keys(dataSnapshot).length === 0) return { mapping: {}, costUsd: 0, inputTokens: 0, outputTokens: 0 };

  const dataLines = Object.entries(dataSnapshot)
    .map(([k, v]) => `  "${k}": ${v}`)
    .join("\n");

  const hintsStr = requiredInputHints.length > 0
    ? `Known input parameters: ${requiredInputHints.join(", ")}`
    : "No explicit input parameter list — infer from the actor's purpose.";

  const systemPrompt = `You are a data pipeline expert. An Apify enrichment actor needs input data from a lead.

Actor: "${actorName}" (${actorId})
${hintsStr}

Common enrichment actor input patterns:
- Website scrapers need: startUrls (a URL) or urls
- Instagram scrapers need: usernames (an Instagram handle or URL)
- Facebook scrapers need: startUrls (a Facebook page URL)
- Contact scrapers need: startUrls (a website URL)

AVAILABLE LEAD DATA (key: sample value):
${dataLines}

Your job: find which lead data keys can provide the input this actor needs.
Return a JSON object mapping actor input parameter names to lead data key paths.

Rules:
- Use standard actor param names: "startUrls" for URLs, "usernames" for handles, "urls" for URL lists.
- The lead data key must be EXACTLY as it appears in the available data.
- If a value looks like a URL or username that matches the actor's purpose, include it.
- Only include mappings you are confident about.
- Output ONLY valid JSON. No markdown, no explanation.

Example: {"usernames": "instagramHandle"} or {"startUrls": "website"}`;

  let costUsd = 0, inputTokens = 0, outputTokens = 0;
  try {
    const response = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Return the input mapping JSON now." },
      ],
      provider,
      { temperature: 0.1, maxTokens: 512 }
    );
    costUsd = response.costUsd;
    inputTokens = response.inputTokens;
    outputTokens = response.outputTokens;

    const cleaned = response.content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed = JSON.parse(cleaned) as Record<string, string>;
    const mapping: Record<string, string> = {};
    for (const [param, key] of Object.entries(parsed)) {
      if (typeof key === "string" && key.trim()) {
        mapping[param.trim()] = key.trim();
      }
    }
    return { mapping, costUsd, inputTokens, outputTokens };
  } catch (err) {
    console.error(`AI actor input resolver failed for ${actorId}:`, err);
    return { mapping: {}, costUsd, inputTokens, outputTokens };
  }
}
