import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { leads, campaigns, analyticsEvents } from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { getLeadDisplayName } from "@/lib/utils/lead-display";

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId");
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") || "500");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const conditions = [];
  if (campaignId) conditions.push(eq(leads.campaignId, parseInt(campaignId)));
  if (status) conditions.push(eq(leads.status, status as typeof leads.status.enumValues[number]));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = db
    .select()
    .from(leads)
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const campaignMap = new Map<number, string>();
  const campaignIds = [...new Set(results.map((r) => r.campaignId).filter(Boolean))] as number[];
  for (const cid of campaignIds) {
    const c = db.select({ name: campaigns.name }).from(campaigns).where(eq(campaigns.id, cid)).get();
    if (c) campaignMap.set(cid, c.name);
  }

  const enriched = results.map((lead) => ({
    ...lead,
    campaignName: lead.campaignId ? campaignMap.get(lead.campaignId) || null : null,
    displayName: lead.displayName || getLeadDisplayName({
      displayName: lead.displayName,
      rawData: lead.rawData ?? undefined,
      mappedData: (lead as { mappedData?: Record<string, unknown> }).mappedData ?? undefined,
    }),
  }));

  const total = db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(where)
    .get()?.count ?? 0;

  return NextResponse.json({ leads: enriched, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  const result = db.insert(leads).values(body).returning().get();

  db.insert(analyticsEvents).values({
    eventType: "lead_found",
    campaignId: result.campaignId,
    leadId: result.id,
    metadata: { source: result.source },
  }).run();

  return NextResponse.json(result, { status: 201 });
}
