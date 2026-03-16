import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export type KpiDefinition = {
  id: string;
  label: string;
  type: "boolean" | "text";
  description?: string;
};

export type LeadFieldDefinition = {
  id: string;
  label: string;
  type: "text" | "number" | "boolean" | "url";
  description?: string;
};

export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  agencyType: text("agency_type").notNull().default("general"),
  targetNiche: text("target_niche").notNull(),
  apifyActors: text("apify_actors", { mode: "json" }).$type<string[]>().default([]),
  searchParams: text("search_params", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  actorConfigs: text("actor_configs", { mode: "json" }).$type<Record<string, Record<string, unknown>>>().default({}),
  kpiDefinitions: text("kpi_definitions", { mode: "json" }).$type<KpiDefinition[]>().default([]),
  leadFieldDefinitions: text("lead_field_definitions", { mode: "json" }).$type<LeadFieldDefinition[]>().default([]),
  scheduleFrequency: text("schedule_frequency", { enum: ["once", "daily", "weekly"] }).notNull().default("once"),
  lastDiscoveryAt: text("last_discovery_at"),
  aiProvider: text("ai_provider", { enum: ["openai", "anthropic"] }).notNull().default("openai"),
  autoEnrich: integer("auto_enrich", { mode: "boolean" }).notNull().default(true),
  maxLeadsPerRun: integer("max_leads_per_run").default(50),
  maxPagesPerSearch: integer("max_pages_per_search").default(5),
  status: text("status", { enum: ["draft", "active", "paused", "completed"] }).notNull().default("draft"),
  enrichmentConcurrency: integer("enrichment_concurrency").default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  source: text("source").notNull(),
  sourceRunId: text("source_run_id"),
  displayName: text("display_name"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  score: integer("score").default(0),
  status: text("status", {
    enum: ["new", "enriching", "qualified", "converted", "declined", "archived"],
  }).notNull().default("new"),
  rawData: text("raw_data", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  mappedData: text("mapped_data", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  llmCostUsd: real("llm_cost_usd").default(0),
  llmInputTokens: integer("llm_input_tokens").default(0),
  llmOutputTokens: integer("llm_output_tokens").default(0),
  apifyCostUsd: real("apify_cost_usd").notNull().default(0),
  discoveryLlmCostUsd: real("discovery_llm_cost_usd").notNull().default(0),
  discoveryApifyCostUsd: real("discovery_apify_cost_usd").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const leadPersonalization = sqliteTable("lead_personalization", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  websiteTechStack: text("website_tech_stack", { mode: "json" }).$type<string[]>().default([]),
  websiteQualityScore: integer("website_quality_score"),
  hasChatbot: integer("has_chatbot", { mode: "boolean" }).default(false),
  hasBookingSystem: integer("has_booking_system", { mode: "boolean" }).default(false),
  hasAutomation: integer("has_automation", { mode: "boolean" }).default(false),
  recentNews: text("recent_news"),
  companyDescription: text("company_description"),
  keyProducts: text("key_products"),
  foundersInfo: text("founders_info"),
  lastBlogPost: text("last_blog_post"),
  socialMediaPresence: text("social_media_presence", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  painPoints: text("pain_points", { mode: "json" }).$type<string[]>().default([]),
  personalizationSummary: text("personalization_summary"),
  enrichmentActors: text("enrichment_actors", { mode: "json" }).$type<string[]>().default([]),
  rawEnrichmentData: text("raw_enrichment_data", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  campaignKpis: text("campaign_kpis", { mode: "json" }).$type<Record<string, boolean | string>>().default({}),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const apifyRuns = sqliteTable("apify_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  actorId: text("actor_id").notNull(),
  runId: text("run_id").notNull(),
  status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull().default("running"),
  inputParams: text("input_params", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  resultCount: integer("result_count").default(0),
  datasetId: text("dataset_id"),
  startedAt: text("started_at").notNull().default(sql`(datetime('now'))`),
  finishedAt: text("finished_at"),
  costUsd: real("cost_usd"),
});

export const analyticsEvents = sqliteTable("analytics_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventType: text("event_type").notNull(),
  campaignId: integer("campaign_id"),
  leadId: integer("lead_id"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const customActors = sqliteTable("custom_actors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorId: text("actor_id").notNull().unique(),
  name: text("name").notNull(),
  phase: text("phase", { enum: ["find", "enrich"] }).notNull(),
  description: text("description"),
  requiredInputFields: text("required_input_fields", { mode: "json" }).$type<string[]>().default([]),
  inputFieldDescriptions: text("input_field_descriptions", { mode: "json" })
    .$type<Record<string, { label: string; placeholder: string; type: "string" | "string-array" | "number" | "boolean"; helpText: string }>>().default({}),
  defaultInput: text("default_input", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  pageLimitKey: text("page_limit_key"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const llmCosts = sqliteTable("llm_costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  provider: text("provider", { enum: ["openai", "anthropic"] }).notNull(),
  model: text("model").notNull(),
  operation: text("operation").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: real("cost_usd").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadPersonalization = typeof leadPersonalization.$inferSelect;
export type ApifyRun = typeof apifyRuns.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type CustomActor = typeof customActors.$inferSelect;
export type NewCustomActor = typeof customActors.$inferInsert;
export type LlmCost = typeof llmCosts.$inferSelect;
