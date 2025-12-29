/**
 * Re-analyze X Articles Script
 *
 * For X Articles that have been backfilled with body content,
 * regenerates the AI analysis (summary, topics, etc.) using the new content.
 *
 * Usage:
 *   npx tsx scripts/reanalyze-x-articles.ts
 *
 * Options (via env vars):
 *   DRY_RUN=true - Preview what would be updated without making changes
 *   LIMIT=10 - Only process this many items (default: all)
 */

import { createClient } from '@supabase/supabase-js';
import { ContentAnalyzer } from '@content-capture/analyzer';
import { EmbeddingsGenerator } from '@content-capture/analyzer';
import type { ExtractedContent, SourceType } from '@content-capture/core';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.env.DRY_RUN === 'true';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : undefined;

async function getArticlesToReanalyze() {
  // Find Twitter items that:
  // - Have isArticle=true in platform_data
  // - Have body_text content
  // - Have stale summary (contains "Unable to analyze" or "no actual content")
  let query = supabase
    .from('content_items')
    .select('id, source_url, title, description, body_text, author_name, author_handle, images, videos, platform_data')
    .eq('source_type', 'twitter')
    .eq('status', 'complete')
    .not('body_text', 'is', null)
    .gt('body_text', '') // Has body text
    .or('summary.ilike.%Unable to analyze%,summary.ilike.%no actual content%,summary.ilike.%not available for analysis%')
    .order('created_at', { ascending: false });

  if (LIMIT) {
    query = query.limit(LIMIT);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch items: ${error.message}`);
  }

  return data || [];
}

async function updateItemAnalysis(
  id: string,
  analysis: {
    summary: string;
    topics: string[];
    discipline: string;
    useCases: string[];
    contentType: string;
  },
  embedding?: number[]
) {
  const updateData: Record<string, unknown> = {
    summary: analysis.summary,
    topics: analysis.topics,
    disciplines: [analysis.discipline],
    use_cases: analysis.useCases,
    content_type: analysis.contentType,
    updated_at: new Date().toISOString(),
  };

  if (embedding) {
    updateData.embedding = embedding;
  }

  const { error } = await supabase
    .from('content_items')
    .update(updateData)
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update item ${id}: ${error.message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(60));
  console.log('Re-analyze X Articles');
  console.log('='.repeat(60));
  if (DRY_RUN) {
    console.log('DRY RUN MODE - No changes will be made');
  }
  if (LIMIT) {
    console.log(`Limiting to ${LIMIT} items`);
  }
  console.log('');

  const items = await getArticlesToReanalyze();

  if (items.length === 0) {
    console.log('No items need re-analysis');
    return;
  }

  console.log(`Found ${items.length} items to re-analyze`);
  console.log('');

  // Initialize analyzer
  const analyzer = new ContentAnalyzer();

  // Initialize embeddings generator if OpenAI key is available
  let embeddingsGenerator: EmbeddingsGenerator | null = null;
  if (process.env.OPENAI_API_KEY) {
    embeddingsGenerator = new EmbeddingsGenerator();
    console.log('Embeddings generation enabled');
  }
  console.log('');

  let processed = 0;
  let errors = 0;

  for (const item of items) {
    processed++;
    const shortTitle = item.title?.slice(0, 50) + (item.title?.length > 50 ? '...' : '') || 'Untitled';

    console.log(`[${processed}/${items.length}] Analyzing: ${shortTitle}`);

    try {
      // Build ExtractedContent for analyzer
      const content: ExtractedContent = {
        title: item.title,
        description: item.description,
        bodyText: item.body_text,
        authorName: item.author_name,
        authorHandle: item.author_handle,
        images: item.images || [],
        videos: item.videos || [],
        platformData: item.platform_data,
      };

      if (DRY_RUN) {
        console.log(`  Body text: ${item.body_text?.length} chars`);
        console.log(`  Would analyze and update...`);
        continue;
      }

      // Run analysis
      const analysis = await analyzer.analyze(content, 'twitter' as SourceType, item.source_url);

      console.log(`  Summary: ${analysis.summary.slice(0, 80)}...`);
      console.log(`  Topics: ${analysis.topics.join(', ')}`);
      console.log(`  Content type: ${analysis.contentType}`);

      // Generate new embedding if available
      let embedding: number[] | undefined;
      if (embeddingsGenerator) {
        try {
          embedding = await embeddingsGenerator.generateContentEmbedding({
            title: content.title,
            description: content.description,
            bodyText: content.bodyText,
            summary: analysis.summary,
            topics: analysis.topics,
            authorName: content.authorName,
          });
          console.log(`  Generated embedding: ${embedding.length} dimensions`);
        } catch (err) {
          console.warn(`  Failed to generate embedding:`, err);
        }
      }

      // Update database
      await updateItemAnalysis(item.id, analysis, embedding);
      console.log(`  ✓ Updated`);

      // Rate limiting
      await sleep(500);
    } catch (err) {
      console.log(`  ✗ ERROR: ${err}`);
      errors++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Items processed: ${processed}`);
  console.log(`Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('');
    console.log('Run without DRY_RUN=true to apply updates');
  }
}

main().catch(console.error);
