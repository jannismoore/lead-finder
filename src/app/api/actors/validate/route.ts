import { NextRequest, NextResponse } from "next/server";
import { generateCompletion, getDefaultAIProvider, logLlmCost } from "@/lib/ai/provider";

const APIFY_BASE_URL = "https://api.apify.com/v2";

const FIND_INDICATORS = [
  "queries", "search", "searchStringsArray", "keywords", "searchTerms",
  "location", "query", "searchQuery", "term", "searchQueries",
  "category", "keyword",
];

const ENRICH_INDICATORS = [
  "startUrls", "urls", "url", "profileUrls", "usernames", "handles",
  "profileUrl", "links", "startUrl", "domain",
];

const PAGE_LIMIT_PATTERNS = [
  /^max/i, /limit$/i, /^limit/i, /results/i, /pages/i, /items/i, /count$/i,
];

function parseActorId(raw: string): string | null {
  const trimmed = raw.trim();

  try {
    const url = new URL(trimmed);
    if (url.hostname === "apify.com" || url.hostname === "www.apify.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length >= 2) {
        return `${segments[0]}/${segments[1]}`;
      }
    }
  } catch {
    // not a URL, treat as raw actor ID
  }

  if (trimmed.includes("/")) {
    return trimmed;
  }

  return null;
}

function classifyFromInputSchema(
  schema: Record<string, unknown>
): { phase: "find" | "enrich"; confidence: "high" | "low" } {
  const properties = (schema?.properties as Record<string, unknown>) || {};
  const fieldNames = Object.keys(properties);

  let findScore = 0;
  let enrichScore = 0;

  for (const field of fieldNames) {
    if (FIND_INDICATORS.some((ind) => field.toLowerCase().includes(ind.toLowerCase()))) findScore++;
    if (ENRICH_INDICATORS.some((ind) => field.toLowerCase().includes(ind.toLowerCase()))) enrichScore++;
  }

  if (enrichScore > findScore) return { phase: "enrich", confidence: enrichScore >= 2 ? "high" : "low" };
  if (findScore > enrichScore) return { phase: "find", confidence: findScore >= 2 ? "high" : "low" };
  return { phase: "find", confidence: "low" };
}

function detectPageLimitKey(properties: Record<string, unknown>): string | null {
  const candidates: { key: string; score: number }[] = [];

  for (const [key, val] of Object.entries(properties)) {
    const field = val as Record<string, unknown>;
    const fieldType = field.type as string;
    if (fieldType !== "integer" && fieldType !== "number") continue;

    let score = 0;
    for (const pattern of PAGE_LIMIT_PATTERNS) {
      if (pattern.test(key)) score++;
    }
    if (score > 0) {
      candidates.push({ key, score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].key;
}

function tryParseSchema(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).properties) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // parse failed
  }
  return null;
}

interface ParsedInputField {
  key: string;
  title: string;
  type: string;
  description: string;
  isRequired: boolean;
  default?: unknown;
  editor?: string;
  enum?: string[];
  prefill?: unknown;
}

function fieldsFromSchema(
  schema: Record<string, unknown>
): ParsedInputField[] {
  const properties = (schema.properties as Record<string, unknown>) || {};
  const required = (schema.required as string[]) || [];
  return Object.entries(properties).map(([key, val]) => {
    const field = val as Record<string, unknown>;
    return {
      key,
      title: (field.title as string) || key,
      type: (field.type as string) || "string",
      description: (field.description as string) || "",
      isRequired: required.includes(key),
      default: field.default,
      editor: field.editor as string | undefined,
      enum: field.enum as string[] | undefined,
      prefill: field.prefill,
    };
  });
}

async function extractFieldsWithLLM(
  actorName: string,
  description: string,
  readme: string
): Promise<{ fields: ParsedInputField[]; pageLimitKey: string | null; phase: "find" | "enrich" } | null> {
  const provider = getDefaultAIProvider();

  const readmeSnippet = readme.slice(0, 6000);

  const systemPrompt = `You are an expert at analyzing Apify actor documentation. Given an actor's name, description, and README, extract the input fields that users need to configure.

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "phase": "find" or "enrich",
  "pageLimitKey": "fieldName" or null,
  "fields": [
    {
      "key": "camelCaseFieldName",
      "title": "Human Readable Title",
      "type": "string" | "array" | "integer" | "boolean" | "object",
      "description": "Brief description of what this field does",
      "isRequired": true/false,
      "default": <default value if mentioned, or null>
    }
  ]
}

Guidelines:
- "phase" should be "find" if the actor searches/scrapes for new data using keywords, categories, locations, etc. It should be "enrich" if it takes specific URLs or identifiers as input to get detailed data about a known entity.
- "pageLimitKey" is the field that controls max results/pages/items (e.g. "maxResults", "maxItems", "limit"). Set to null if not found.
- Extract ALL input fields you can identify from the documentation.
- Use camelCase for field keys (matching what the Apify API expects).
- For type, use JSON Schema types: "string", "array", "integer", "boolean", "object".
- Mark fields as required if the docs indicate they are mandatory or essential for the actor to work.
- Include sensible defaults when the docs mention them.`;

  const userPrompt = `Actor: ${actorName}

Description: ${description}

README/Documentation:
${readmeSnippet}`;

  try {
    const response = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      provider,
      { temperature: 0.1, maxTokens: 2048 }
    );

    logLlmCost(response, "actor-validation");

    const text = response.content.trim();
    const jsonStr = text.startsWith("{") ? text : text.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(jsonStr);

    const fields: ParsedInputField[] = (parsed.fields || []).map((f: Record<string, unknown>) => ({
      key: (f.key as string) || "",
      title: (f.title as string) || (f.key as string) || "",
      type: (f.type as string) || "string",
      description: (f.description as string) || "",
      isRequired: Boolean(f.isRequired),
      default: f.default ?? undefined,
    })).filter((f: ParsedInputField) => f.key);

    return {
      fields,
      pageLimitKey: (parsed.pageLimitKey as string) || null,
      phase: parsed.phase === "enrich" ? "enrich" : "find",
    };
  } catch (err) {
    console.error("LLM field extraction failed:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Apify token is not configured. Set APIFY_TOKEN in .env or on the Settings page." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const rawInput = (body as { actorId: string }).actorId;

  const actorId = parseActorId(rawInput || "");
  if (!actorId) {
    return NextResponse.json(
      { error: "Invalid input. Paste an Apify URL (e.g. https://apify.com/username/actor-name) or an actor ID (username/actor-name)." },
      { status: 400 }
    );
  }

  const encodedId = actorId.replace("/", "~");
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const actorRes = await fetch(`${APIFY_BASE_URL}/acts/${encodedId}`, { headers });

    if (!actorRes.ok) {
      if (actorRes.status === 404) {
        return NextResponse.json({ error: "Actor not found on Apify. Check the actor ID or URL." }, { status: 404 });
      }
      if (actorRes.status === 401) {
        return NextResponse.json({ error: "Invalid Apify token." }, { status: 401 });
      }
      return NextResponse.json({ error: `Apify returned status ${actorRes.status}` }, { status: actorRes.status });
    }

    const actorData = await actorRes.json();
    const actor = actorData.data;

    let inputSchema: Record<string, unknown> | null = null;
    let readme = "";

    // --- Layer 1: Version API (works for all public actors) ---
    const versions = actor.versions as { versionNumber: string; buildTag?: string }[] | undefined;
    if (versions && versions.length > 0) {
      const latestVersion = versions[versions.length - 1];
      try {
        const versionRes = await fetch(
          `${APIFY_BASE_URL}/acts/${encodedId}/versions/${latestVersion.versionNumber}`,
          { headers }
        );
        if (versionRes.ok) {
          const versionData = await versionRes.json();
          const ver = versionData.data;
          inputSchema = tryParseSchema(ver?.inputSchema);
          if (ver?.readme) readme = ver.readme;
        }
      } catch {
        // version fetch failed, continue to next layer
      }
    }

    // --- Layer 2: Builds API (works for actors user owns/has run) ---
    if (!inputSchema) {
      try {
        const buildsRes = await fetch(
          `${APIFY_BASE_URL}/acts/${encodedId}/builds?limit=1&desc=true&status=SUCCEEDED`,
          { headers }
        );
        if (buildsRes.ok) {
          const buildsData = await buildsRes.json();
          const latestBuild = buildsData?.data?.items?.[0];
          if (latestBuild) {
            inputSchema = tryParseSchema(latestBuild.inputSchema)
              || tryParseSchema(latestBuild.actorDefinition?.input);
            if (!readme && latestBuild.readme) readme = latestBuild.readme;
          }
        }
      } catch {
        // builds fetch failed, continue to next layer
      }
    }

    // --- Layers 1 & 2 succeeded: use structured schema ---
    if (inputSchema) {
      const inputProperties = (inputSchema.properties as Record<string, unknown>) || {};
      const classification = classifyFromInputSchema(inputSchema);
      const suggestedPageLimitKey = detectPageLimitKey(inputProperties);
      const parsedInputFields = fieldsFromSchema(inputSchema);

      return NextResponse.json({
        actorId,
        name: actor.title || actor.name || actorId,
        description: actor.description || "",
        suggestedPhase: classification.phase,
        classificationConfidence: classification.confidence,
        suggestedPageLimitKey,
        inputFields: parsedInputFields,
      });
    }

    // --- Layer 3: LLM extraction from README/description ---
    const actorName = actor.title || actor.name || actorId;
    const actorDescription = actor.description || "";

    if (readme || actorDescription) {
      const llmResult = await extractFieldsWithLLM(actorName, actorDescription, readme);
      if (llmResult && llmResult.fields.length > 0) {
        return NextResponse.json({
          actorId,
          name: actorName,
          description: actorDescription,
          suggestedPhase: llmResult.phase,
          classificationConfidence: "low" as const,
          suggestedPageLimitKey: llmResult.pageLimitKey,
          inputFields: llmResult.fields,
        });
      }
    }

    // --- All layers failed: return actor info with empty fields ---
    return NextResponse.json({
      actorId,
      name: actorName,
      description: actorDescription,
      suggestedPhase: "find" as const,
      classificationConfidence: "low" as const,
      suggestedPageLimitKey: null,
      inputFields: [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to validate actor: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
