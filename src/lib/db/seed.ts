import { getDb } from "./index";
import { settings } from "./schema";

export async function seed() {
  const db = getDb();

  const existingSettings = db.select().from(settings).all();
  if (existingSettings.length === 0) {
    db.insert(settings).values([
      { key: "apify_token", value: "" },
      { key: "openai_api_key", value: "" },
      { key: "anthropic_api_key", value: "" },
      { key: "agency_name", value: "" },
      { key: "agency_type", value: "general" },
    ]).run();
  }
}
