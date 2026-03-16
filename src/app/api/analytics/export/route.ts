import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "json";
  const campaignId = url.searchParams.get("campaignId");

  const allLeads = campaignId
    ? db.select().from(leads).where(eq(leads.campaignId, parseInt(campaignId))).all()
    : db.select().from(leads).all();

  if (format === "csv") {
    const headers = [
      "id", "displayName", "email", "phone", "website",
      "score", "status", "source", "createdAt",
    ];

    const rows = allLeads.map((lead) =>
      headers.map((h) => {
        const val = lead[h as keyof typeof lead];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",")
    );

    const csv = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=leads-export-${new Date().toISOString().split("T")[0]}.csv`,
      },
    });
  }

  return new NextResponse(JSON.stringify(allLeads, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename=leads-export-${new Date().toISOString().split("T")[0]}.json`,
    },
  });
}
