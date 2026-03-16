import { NextRequest, NextResponse } from "next/server";
import { generateCompletion, getDefaultAIProvider, logLlmCost } from "@/lib/ai/provider";

export async function POST(req: NextRequest) {
  const { context } = (await req.json()) as { context: string };

  if (!context?.trim()) {
    return NextResponse.json({ error: "Context is required" }, { status: 400 });
  }

  const provider = getDefaultAIProvider();

  const response = await generateCompletion(
    [
      {
        role: "system",
        content: `You extract structured agency profile information from freeform text. The user will provide raw context about their agency — it could be website copy, an about page, pitch notes, or informal descriptions.

Extract the following fields and return them as a JSON object:
- "agency_name": The agency's name
- "agency_description": A concise 1-3 sentence description of what the agency does and their unique approach
- "agency_services": Key services they offer, as a comma-separated list
- "agency_results": Notable results, case studies, or social proof (keep it concise, data-driven where possible)
- "agency_target_industries": Industries they serve, comma-separated
- "agency_website": Their website URL if mentioned
- "sender_first_name": The first name of the primary contact/sender if mentioned
- "sender_last_name": The last name of the primary contact/sender if mentioned
- "sender_email": The email address of the primary contact/sender if mentioned

Only include fields where you found clear information. For missing fields, use an empty string "".
Return ONLY valid JSON, no markdown, no code fences.`,
      },
      {
        role: "user",
        content: `Extract agency profile details from this context:\n\n${context}`,
      },
    ],
    provider,
    { temperature: 0.3, maxTokens: 1024 }
  );

  logLlmCost(response, "profile-generation");

  try {
    const cleaned = response.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const profile = JSON.parse(cleaned);
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse AI response" },
      { status: 500 }
    );
  }
}
