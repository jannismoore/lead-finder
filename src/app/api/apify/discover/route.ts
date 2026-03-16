import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ApifyError } from "@/lib/apify/runner";
import { runSingleActorDiscovery } from "@/lib/apify/discovery";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { actorId, input, campaignId } = body as {
    actorId: string;
    input: Record<string, unknown>;
    campaignId: number;
  };

  if (!actorId || !input || !campaignId) {
    return NextResponse.json({ error: "Missing actorId, input, or campaignId" }, { status: 400 });
  }

  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  try {
    const result = await runSingleActorDiscovery(actorId, input, campaignId);

    if (result.status === "failed") {
      return NextResponse.json({ error: result.error || "Discovery failed", runId: result.runId }, { status: 500 });
    }

    const currentActors = (campaign.apifyActors as string[]) || [];
    if (!currentActors.includes(actorId)) {
      db.update(campaigns)
        .set({ apifyActors: [...currentActors, actorId], updatedAt: new Date().toISOString() })
        .where(eq(campaigns.id, campaignId))
        .run();
    }

    return NextResponse.json({
      success: true,
      runId: result.runId,
      totalResults: result.totalResults,
      inserted: result.inserted,
      deduplicated: result.deduplicated,
    });
  } catch (err) {
    if (err instanceof ApifyError) {
      return NextResponse.json({
        error: err.message,
        errorType: err.errorType,
        actionUrl: err.actionUrl,
        actionLabel: err.actionLabel,
      }, { status: 500 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
