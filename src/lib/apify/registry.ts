export type ActorCategory = "lead-generation" | "enrichment" | "social" | "search";
export type ActorPhase = "find" | "enrich";

export interface InputFieldDescription {
  label: string;
  placeholder: string;
  type: "string" | "string-array" | "number" | "boolean";
  helpText: string;
}

export interface ActorDefinition {
  id: string;
  name: string;
  category: ActorCategory;
  phase: ActorPhase;
  description: string;
  requiredInputFields: string[];
  inputFieldDescriptions?: Record<string, InputFieldDescription>;
  defaultInput?: Record<string, unknown>;
  isCustom?: boolean;
  pageLimitKey?: string;
}

export const ACTOR_REGISTRY: ActorDefinition[] = [
  {
    id: "compass/crawler-google-places",
    name: "Google Maps Scraper",
    category: "lead-generation",
    phase: "find",
    description: "Extract business listings, ratings, contact info from Google Maps",
    requiredInputFields: ["searchStringsArray"],
    inputFieldDescriptions: {
      searchStringsArray: {
        label: "Search Terms",
        placeholder: "e.g., plumber in Dallas TX, electrician in Austin TX",
        type: "string-array",
        helpText: "Enter each search query on a new line or separated by commas. Include the business type and location.",
      },
      maxCrawledPlacesPerSearch: {
        label: "Max Places Per Search Query",
        type: "number",
        placeholder: "50",
        helpText: "Max places to scrape per search term. Total results = this × number of search terms. Apify charges ~$2.10/1,000 places.",
      },
    },
    defaultInput: { maxCrawledPlacesPerSearch: 50, language: "en" },
  },
  {
    id: "poidata/google-maps-email-extractor",
    name: "Google Maps Email Extractor",
    category: "lead-generation",
    phase: "find",
    description: "Extract emails from Google Maps business listings",
    requiredInputFields: ["searchStringsArray"],
    inputFieldDescriptions: {
      searchStringsArray: {
        label: "Search Terms",
        placeholder: "e.g., dentist in Miami FL, chiropractor in Orlando FL",
        type: "string-array",
        helpText: "Enter each search query on a new line or separated by commas. Include the business type and location.",
      },
      maxResults: {
        label: "Max Results",
        type: "number",
        placeholder: "50",
        helpText: "Maximum total results to return from this actor.",
      },
    },
    defaultInput: { maxResults: 50 },
  },
  {
    id: "apify/google-search-scraper",
    name: "Google Search Scraper",
    category: "search",
    phase: "find",
    description: "Scrape Google search results for lead discovery",
    requiredInputFields: ["queries"],
    inputFieldDescriptions: {
      queries: {
        label: "Search Queries",
        placeholder: "e.g., best plumber in Dallas, HVAC companies near me",
        type: "string-array",
        helpText: "Enter Google search queries, one per line or comma-separated.",
      },
      maxPagesPerQuery: {
        label: "Max Pages Per Query",
        type: "number",
        placeholder: "1",
        helpText: "Number of Google search result pages per query. Each page has ~50 results.",
      },
      resultsPerPage: {
        label: "Results Per Page",
        type: "number",
        placeholder: "50",
        helpText: "Number of results per search page (max 100).",
      },
    },
    defaultInput: { maxPagesPerQuery: 1, resultsPerPage: 50 },
  },
  {
    id: "vdrmota/contact-info-scraper",
    name: "Contact Info Scraper",
    category: "enrichment",
    phase: "enrich",
    description: "Enrich leads with emails, phones, social profiles from their website",
    requiredInputFields: ["startUrls"],
    defaultInput: { maxRequestsPerStartUrl: 5 },
  },
  {
    id: "apify/facebook-pages-scraper",
    name: "Facebook Pages Scraper",
    category: "social",
    phase: "enrich",
    description: "Enrich leads with data from their Facebook business page",
    requiredInputFields: ["startUrls"],
    defaultInput: {},
  },
  {
    id: "apify/instagram-profile-scraper",
    name: "Instagram Profile Scraper",
    category: "social",
    phase: "enrich",
    description: "Enrich leads with Instagram profile data and metrics",
    requiredInputFields: ["usernames"],
    defaultInput: {},
  },
];

export const ACTOR_WORKFLOWS = [
  {
    name: "Local Business Lead + Enrichment",
    steps: ["compass/crawler-google-places", "vdrmota/contact-info-scraper"],
    description: "Find local businesses on Google Maps, then enrich with contact details",
  },
  {
    name: "Google Search + Contact Extraction",
    steps: ["apify/google-search-scraper", "vdrmota/contact-info-scraper"],
    description: "Search Google for businesses, then extract contact info from their websites",
  },
];

export function getActorById(id: string): ActorDefinition | undefined {
  return ACTOR_REGISTRY.find((a) => a.id === id);
}

export function getActorsByCategory(category: ActorCategory): ActorDefinition[] {
  return ACTOR_REGISTRY.filter((a) => a.category === category);
}

export function getActorCategories(): { category: ActorCategory; label: string }[] {
  return [
    { category: "lead-generation", label: "Lead Generation" },
    { category: "enrichment", label: "Enrichment" },
    { category: "social", label: "Social Media" },
    { category: "search", label: "Search" },
  ];
}

export function getActorsByPhase(phase: ActorPhase): ActorDefinition[] {
  return ACTOR_REGISTRY.filter((a) => a.phase === phase);
}

export function getPhaseLabel(phase: ActorPhase): string {
  return phase === "find" ? "Find Leads" : "Enrich Leads";
}
