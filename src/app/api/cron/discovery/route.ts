import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { runCampaignDiscovery, type DiscoveryResult } from "@/lib/apify/discovery";

const FREQUENCY_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export async function POST() {
  const db = getDb();

  const activeCampaigns = db
    .select()
    .from(campaigns)
    .where(
      sql`${campaigns.status} = 'active' AND ${campaigns.scheduleFrequency} != 'once'`
    )
    .all();

  const results: Array<{ campaignId: number; campaignName: string; status: string; result?: DiscoveryResult; error?: string }> = [];

  for (const campaign of activeCampaigns) {
    const intervalMs = FREQUENCY_MS[campaign.scheduleFrequency] || FREQUENCY_MS.daily;
    const lastRun = campaign.lastDiscoveryAt ? new Date(campaign.lastDiscoveryAt).getTime() : 0;
    const now = Date.now();

    if (now - lastRun < intervalMs) {
      results.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: "skipped",
      });
      continue;
    }

    try {
      const result = await runCampaignDiscovery(campaign.id);
      results.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: "completed",
        result,
      });
    } catch (err) {
      results.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: "error",
        error: String(err),
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}
