import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { llmCosts, settings } from "../db/schema";

export type AIProvider = "openai" | "anthropic";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "claude-sonnet-4-20250514": { inputPer1M: 3.0, outputPer1M: 15.0 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? { inputPer1M: 3.0, outputPer1M: 15.0 };
  return (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1_000_000;
}

export function getDefaultAIProvider(): AIProvider {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, "ai_provider")).get();
  return (row?.value as AIProvider) ?? "openai";
}

export async function generateCompletion(
  messages: AIMessage[],
  provider: AIProvider,
  options?: { temperature?: number; maxTokens?: number }
): Promise<AIResponse> {
  const temperature = options?.temperature ?? 0.7;
  const maxTokens = options?.maxTokens ?? 2048;

  if (provider === "openai") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature,
      max_tokens: maxTokens,
    });
    const inputTokens = res.usage?.prompt_tokens ?? 0;
    const outputTokens = res.usage?.completion_tokens ?? 0;
    return {
      content: res.choices[0]?.message?.content ?? "",
      provider: "openai",
      model: "gpt-4o",
      inputTokens,
      outputTokens,
      costUsd: calculateCost("gpt-4o", inputTokens, outputTokens),
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const systemMessage = messages.find((m) => m.role === "system")?.content ?? "";
  const nonSystemMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const res = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system: systemMessage,
    messages: nonSystemMessages,
  });

  const textBlock = res.content.find((b) => b.type === "text");
  const inputTokens = res.usage?.input_tokens ?? 0;
  const outputTokens = res.usage?.output_tokens ?? 0;
  return {
    content: textBlock?.text ?? "",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    inputTokens,
    outputTokens,
    costUsd: calculateCost("claude-sonnet-4-20250514", inputTokens, outputTokens),
  };
}

export function logLlmCost(
  response: AIResponse,
  operation: string,
  campaignId?: number
) {
  const db = getDb();
  db.insert(llmCosts).values({
    campaignId: campaignId ?? null,
    provider: response.provider,
    model: response.model,
    operation,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costUsd: response.costUsd,
  }).run();
}
