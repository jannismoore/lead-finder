import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { leads, leadPersonalization, analyticsEvents, campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { leadEmitter } from "@/lib/events/emitter";
import { getLeadDisplayName } from "@/lib/utils/lead-display";
import { getActorById } from "@/lib/apify/registry-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const lead = db.select().from(leads).where(eq(leads.id, parseInt(id))).get();
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const personalization = db
    .select()
    .from(leadPersonalization)
    .where(eq(leadPersonalization.leadId, lead.id))
    .get();

  const campaign = lead.campaignId
    ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
    : null;

  const events = db
    .select()
    .from(analyticsEvents)
    .where(eq(analyticsEvents.leadId, lead.id))
    .all();

  const leadWithDisplay = {
    ...lead,
    displayName: lead.displayName || getLeadDisplayName({
      displayName: lead.displayName,
      rawData: lead.rawData ?? undefined,
      mappedData: (lead as { mappedData?: Record<string, unknown> }).mappedData ?? undefined,
    }),
  };

  const campaignActors = (campaign?.apifyActors as string[] | undefined) || [];
  const disabledActors = new Set<string>(
    (campaign?.actorConfigs as Record<string, unknown>)?._disabledEnrichActors as string[] || []
  );
  const enrichActorIds = campaignActors.filter((actorId) => {
    const actor = getActorById(actorId);
    return actor?.phase === "enrich" && !disabledActors.has(actorId);
  });

  return NextResponse.json({
    ...leadWithDisplay,
    personalization,
    kpiDefinitions: campaign?.kpiDefinitions || [],
    leadFieldDefinitions: campaign?.leadFieldDefinitions || [],
    enrichActorIds,
    events,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const leadId = parseInt(id);

  if (body.campaignKpis) {
    const existing = db.select().from(leadPersonalization).where(eq(leadPersonalization.leadId, leadId)).get();
    if (existing) {
      db.update(leadPersonalization)
        .set({ campaignKpis: JSON.stringify(body.campaignKpis) as unknown as Record<string, boolean | string> })
        .where(eq(leadPersonalization.id, existing.id))
        .run();
    } else {
      db.insert(leadPersonalization).values({
        leadId,
        campaignKpis: JSON.stringify(body.campaignKpis) as unknown as Record<string, boolean | string>,
      }).run();
    }
    delete body.campaignKpis;
  }

  if (Object.keys(body).length > 0) {
    db.update(leads)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(leads.id, leadId))
      .run();
  }

  const updated = db.select().from(leads).where(eq(leads.id, leadId)).get();

  if (body.status && updated?.campaignId) {
    leadEmitter.emit("lead:status-changed", {
      leadId,
      campaignId: updated.campaignId,
      status: body.status,
    });
  }

  return NextResponse.json(updated);
}
