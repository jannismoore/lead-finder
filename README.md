# Lead Finder

Find and enrich leads on autopilot using AI. A cost-effective, flexible alternative to tools like [Clay](https://clay.com) — combine multiple data sources, score leads automatically, and export ready-to-use prospect lists.

## What It Does

1. **Find leads** — Pick a niche (e.g. "dentists in Miami") and Lead Finder pulls business listings from Google Maps, Google Search, or any other data source you connect.
2. **Enrich automatically** — Each lead gets enriched with contact info (emails, phones), social media profiles, website analysis, and more — all in one pipeline.
3. **Score with AI** — AI analyzes every lead against your agency profile and scores them 0-100 on how likely they are to convert. It also identifies pain points and personalization angles.
4. **Review and export** — Browse everything in a clean dashboard, filter by score, and export to CSV when you're ready to reach out.

You configure it once, hit "Discover", and the system handles the rest.

## Why This Over Clay / Other Tools

- **Much cheaper** — You only pay for Apify credits and AI tokens (pennies per lead). No $149+/mo SaaS subscription.
- **More flexible** — Connect any Apify scraper from their 3,000+ actor marketplace. Custom KPIs, custom lead fields, custom enrichment chains.
- **You own the data** — Everything runs locally with a SQLite database. No data leaves your machine except API calls to Apify and your AI provider.
- **Built for automation** — CLI interface for scripting, cron-friendly discovery, and a real-time dashboard for monitoring.

## Quick Start

You need three things: an [Apify account](https://apify.com) (free tier available), an AI API key ([OpenAI](https://platform.openai.com/api-keys) or [Anthropic](https://console.anthropic.com)), and Node.js 18+.

```bash
# 1. Clone and install
git clone https://github.com/jannismoore/lead-finder.git
cd lead-finder
npm install

# 2. Set up your API keys
cp .env.example .env
# Edit .env and add your APIFY_TOKEN + OPENAI_API_KEY or ANTHROPIC_API_KEY

# 3. Set up the database
npm run db:migrate

# 4. Start the app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and you're ready to go. You can also configure API keys through the Settings page in the UI instead of editing `.env`.

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────────┐
│   Campaign   │────▶│  Data Source  │────▶│ AI Extractor │────▶│   Leads    │
│  (niche,     │     │  (Google Maps│     │ (normalize,  │     │ (scored,   │
│   KPIs,      │     │   Search,   │     │  deduplicate)│     │  enriched) │
│   fields)    │     │   custom)    │     │              │     │            │
└─────────────┘     └──────────────┘     └──────────────┘     └────────────┘
                                                                     │
                                                                     ▼
                                                              ┌────────────┐
                                                              │ Enrichment │
                                                              │ (contact   │
                                                              │  info,     │
                                                              │  social,   │
                                                              │  AI score) │
                                                              └────────────┘
```

### The Dashboard

- **Campaigns** — Create and manage lead discovery campaigns. Each campaign targets a niche, uses one or more data sources, and defines what fields and KPIs you care about.
- **Leads** — Browse all discovered leads with scores, contact info, enrichment data. Click into any lead for the full profile.
- **Costs** — See exactly what you're spending per lead, broken down by Apify credits and AI tokens.
- **Settings** — API keys, agency profile (so AI scoring is personalized to your business), and custom data source management.

### Built-in Data Sources

| Source | What it does |
|--------|-------------|
| Google Maps Scraper | Pull business listings, ratings, contact info from Google Maps |
| Google Maps Email Extractor | Extract emails directly from Google Maps listings |
| Google Search Scraper | Scrape Google search results for any query |
| Contact Info Scraper | Extract emails, phones, social links from any website |
| Facebook Pages Scraper | Pull data from Facebook business pages |
| Instagram Profile Scraper | Pull Instagram profile data and metrics |

Want more? Add any of the 3,000+ scrapers from the [Apify Store](https://apify.com/store) through the Settings page — no code needed.

### CLI

For automation and scripting, everything is also available via the command line:

```bash
# Discover leads for a niche
npm run cli discover \
  --actor "compass/crawler-google-places" \
  --input '{"searchStringsArray": ["plumber in Dallas TX"], "maxCrawledPlacesPerSearch": 20}' \
  --campaign "Dallas Plumbers" \
  --niche "Plumbing"

# Enrich leads with contact info + AI scoring
npm run cli enrich \
  --campaign "Dallas Plumbers" \
  --provider openai \
  --limit 10

# Check what's running
npm run cli status
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APIFY_TOKEN` | Yes | Your [Apify API token](https://console.apify.com/settings/integrations) |
| `OPENAI_API_KEY` | One of these | [OpenAI API key](https://platform.openai.com/api-keys) for GPT-4o |
| `ANTHROPIC_API_KEY` | One of these | [Anthropic API key](https://console.anthropic.com) for Claude Sonnet |

All keys can also be set through the Settings page in the app.

### Agency Profile

Set up your agency profile in Settings so the AI knows what you do. It uses your description, services, target industries, and past results to score leads on how well they match your ideal customer. The more context you give it, the better the scoring.

---

## Technical Details

<details>
<summary>Tech stack, project structure, and scripts</summary>

### Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- **Database:** SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) + [Drizzle ORM](https://orm.drizzle.team)
- **AI:** [OpenAI](https://platform.openai.com) (GPT-4o) / [Anthropic](https://www.anthropic.com) (Claude Sonnet 4)
- **Scraping:** [Apify](https://apify.com) actors
- **UI:** [shadcn/ui](https://ui.shadcn.com), [Radix UI](https://www.radix-ui.com), [Tailwind CSS](https://tailwindcss.com), [Recharts](https://recharts.org)
- **CLI:** [Commander.js](https://github.com/tj/commander.js)

### Project Structure

```
├── cli/                          # CLI commands (discover, enrich, status)
├── drizzle/                      # Database migrations
├── public/                       # Static assets
└── src/
    ├── app/
    │   ├── (dashboard)/          # Dashboard pages
    │   │   ├── campaigns/        # Campaign management
    │   │   ├── leads/            # Lead browsing and details
    │   │   ├── costs/            # Cost analytics
    │   │   └── settings/         # Configuration
    │   └── api/                  # API routes
    │       ├── actors/           # Custom actor management
    │       ├── analytics/        # Analytics + CSV export
    │       ├── campaigns/        # Campaign operations
    │       ├── costs/            # Cost data
    │       ├── cron/             # Scheduled discovery
    │       ├── events/           # Real-time updates (SSE)
    │       ├── leads/            # Lead operations
    │       └── settings/         # Settings management
    ├── components/               # React components
    ├── hooks/                    # Custom React hooks
    └── lib/
        ├── ai/                   # AI provider abstraction
        ├── apify/                # Apify integration
        ├── db/                   # Database (schema, migrations, seed)
        ├── enrichment/           # Enrichment pipeline
        ├── events/               # Event emitter for SSE
        └── utils/                # Helpers
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate new Drizzle migration |
| `npm run db:migrate` | Apply migrations and seed data |
| `npm run cli` | Run CLI commands |

</details>

## License

MIT

## Author

**Jannis Moore**

- YouTube: [@jannismoore](https://www.youtube.com/@jannismoore)
- Instagram: [@jannismoore](https://www.instagram.com/jannismoore)
