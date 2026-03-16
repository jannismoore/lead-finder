import { NextResponse } from "next/server";

const ENV_KEY_MAP: Record<string, string> = {
  apify_token: "APIFY_TOKEN",
  openai_api_key: "OPENAI_API_KEY",
  anthropic_api_key: "ANTHROPIC_API_KEY",
};

export async function GET() {
  const status: Record<string, boolean> = {};
  for (const [settingsKey, envVar] of Object.entries(ENV_KEY_MAP)) {
    status[settingsKey] = !!process.env[envVar];
  }
  return NextResponse.json(status);
}
