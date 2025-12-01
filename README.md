# Content Capture

A system for capturing, categorizing, and storing web content from Twitter/X, Instagram, LinkedIn, Pinterest, and general websites.

## Architecture

```
iOS Share Extension / Web UI
         ↓
    Vercel (Next.js API)
         ↓
    Google Cloud Pub/Sub
         ↓
    Google Cloud Function
         ↓
    ├── Scrapers (Apify for social, Cheerio for web)
    ├── Claude AI (categorization)
    ├── Cloud Storage (media)
    └── Supabase (database)
```

## Quick Start

### 1. Clone and Install

```bash
cd ~/Projects/content-capture
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once created, go to SQL Editor and run the schema:
   ```bash
   cat supabase/schema.sql
   # Copy and paste into Supabase SQL Editor, then run
   ```
3. Go to Settings → API and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Set Up Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable these APIs:
   - Cloud Pub/Sub
   - Cloud Functions
   - Cloud Storage
4. Create a Pub/Sub topic:
   ```bash
   gcloud pubsub topics create content-capture-process
   ```
5. Create a Cloud Storage bucket:
   ```bash
   gcloud storage buckets create gs://your-project-content-capture-media
   ```
6. Create a service account for local development:
   ```bash
   gcloud iam service-accounts create content-capture-dev
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:content-capture-dev@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   gcloud iam service-accounts keys create ~/content-capture-key.json \
     --iam-account=content-capture-dev@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

### 4. Get API Keys

- **Anthropic (Claude)**: [console.anthropic.com](https://console.anthropic.com)
- **Apify** (for Twitter/Instagram): [console.apify.com](https://console.apify.com)

### 5. Configure Environment

Edit `apps/web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_PUBSUB_TOPIC=content-capture-process
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
ANTHROPIC_API_KEY=sk-ant-...
APIFY_API_TOKEN=apify_api_...
```

### 6. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 7. Deploy Cloud Function

```bash
cd functions/process-capture
npm install
npm run build
npm run deploy
```

## Project Structure

```
content-capture/
├── apps/
│   └── web/                    # Next.js web app
│       ├── src/app/            # Pages and API routes
│       └── src/lib/            # Supabase, Pub/Sub clients
│
├── packages/
│   ├── core/                   # Shared types
│   ├── scrapers/               # Content extraction
│   │   ├── generic.ts          # Web scraper (cheerio)
│   │   ├── twitter.ts          # Twitter (Apify)
│   │   └── instagram.ts        # Instagram (Apify)
│   └── analyzer/               # Claude AI integration
│
├── functions/
│   └── process-capture/        # Google Cloud Function
│
└── supabase/
    └── schema.sql              # Database schema
```

## Next Steps

- [ ] iOS Share Extension
- [ ] Notion sync
- [ ] Visual search interface
- [ ] Browser extension
