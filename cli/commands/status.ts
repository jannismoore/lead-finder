import { Command } from "commander";
import { getDb } from "../../src/lib/db";
import { campaigns, leads, apifyRuns } from "../../src/lib/db/schema";
import { sql, eq } from "drizzle-orm";

export const statusCommand = new Command("status")
  .description("Show current system status")
  .action(async () => {
    const db = getDb();

    const totalCampaigns = db.select({ count: sql<number>`count(*)` }).from(campaigns).get()?.count ?? 0;
    const activeCampaigns = db.select({ count: sql<number>`count(*)` }).from(campaigns).where(eq(campaigns.status, "active")).get()?.count ?? 0;
    const totalLeads = db.select({ count: sql<number>`count(*)` }).from(leads).get()?.count ?? 0;
    const runningJobs = db.select({ count: sql<number>`count(*)` }).from(apifyRuns).where(eq(apifyRuns.status, "running")).get()?.count ?? 0;

    console.log("\n=== Lead Finder Status ===\n");
    console.log(`Campaigns: ${totalCampaigns} total, ${activeCampaigns} active`);
    console.log(`Leads: ${totalLeads} total`);
    console.log(`Apify jobs: ${runningJobs} running`);

    const allCampaigns = db.select().from(campaigns).all();
    if (allCampaigns.length > 0) {
      console.log("\nCampaigns:");
      for (const c of allCampaigns) {
        const leadCount = db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.campaignId, c.id)).get()?.count ?? 0;
        console.log(`  [${c.status}] ${c.name} — ${leadCount} leads`);
      }
    }

    console.log("");
  });
