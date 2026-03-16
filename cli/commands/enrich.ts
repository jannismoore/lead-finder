import { Command } from "commander";
import { getDb } from "../../src/lib/db";
import { campaigns, leads } from "../../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { enrichLead } from "../../src/lib/enrichment/pipeline";
import type { AIProvider } from "../../src/lib/ai/provider";

export const enrichCommand = new Command("enrich")
  .description("Enrich leads with contact info and AI scoring")
  .requiredOption("--campaign <name>", "Campaign name")
  .option("--provider <provider>", "AI provider (openai/anthropic)", "openai")
  .option("--limit <n>", "Max leads to enrich", "10")
  .action(async (opts) => {
    const db = getDb();

    const campaign = db
      .select()
      .from(campaigns)
      .where(eq(campaigns.name, opts.campaign))
      .get();

    if (!campaign) {
      console.error(`Campaign "${opts.campaign}" not found`);
      process.exit(1);
    }

    const campaignLeads = db
      .select()
      .from(leads)
      .where(eq(leads.campaignId, campaign.id))
      .all()
      .filter((l) => l.website)
      .slice(0, parseInt(opts.limit));

    console.log(`Enriching ${campaignLeads.length} leads from "${campaign.name}"...`);

    let enriched = 0;
    let failed = 0;

    for (const lead of campaignLeads) {
      try {
        console.log(`  Enriching: ${lead.displayName || lead.website}...`);
        await enrichLead(lead.id, null, opts.provider as AIProvider);
        enriched++;
        console.log(`    Score: ${lead.score ?? "pending"}`);
      } catch (err) {
        failed++;
        console.error(`    Failed: ${err}`);
      }
    }

    console.log(`\nDone: ${enriched} enriched, ${failed} failed`);
  });
