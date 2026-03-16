import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runCampaignDiscovery } from "@/lib/apify/discovery";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignId = parseInt(id);

  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status !== "active") {
    return NextResponse.json({ error: "Campaign must be active to run discovery" }, { status: 400 });
  }

  const actors = (campaign.apifyActors as string[]) || [];
  if (actors.length === 0) {
    return NextResponse.json({ error: "Campaign has no actors configured" }, { status: 400 });
  }

  try {
    const result = await runCampaignDiscovery(campaignId);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
