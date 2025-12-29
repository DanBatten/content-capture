/**
 * Backfill X Articles Script
 *
 * Finds Twitter/X items that might be X Articles (empty or minimal body text)
 * and re-scrapes them to capture the full article content.
 *
 * Usage:
 *   npx tsx scripts/backfill-x-articles.ts
 *
 * Options (via env vars):
 *   DRY_RUN=true - Preview what would be updated without making changes
 *   LIMIT=10 - Only process this many items (default: all)
 */

import { createClient } from '@supabase/supabase-js';
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

interface ArticleBlock {
  key: string;
  type: string;
  text: string;
}

interface FxTwitterArticle {
  id: string;
  title: string;
  preview_text?: string;
  cover_media?: {
    media_info?: {
      original_img_url?: string;
      original_img_width?: number;
      original_img_height?: number;
    };
  };
  content?: {
    blocks?: ArticleBlock[];
  };
}

interface FxTwitterResponse {
  code: number;
  message: string;
  tweet?: {
    id: string;
    text: string;
    article?: FxTwitterArticle;
    author: {
      name: string;
      screen_name: string;
    };
  };
}

function extractArticleText(article: FxTwitterArticle): string {
  if (!article.content?.blocks) {
    return article.preview_text || '';
  }

  const textParts: string[] = [];

  for (const block of article.content.blocks) {
    if (!block.text) continue;

    if (block.type === 'header-one' || block.type === 'header-two') {
      textParts.push(`\n## ${block.text}\n`);
    } else {
      textParts.push(block.text);
    }
  }

  return textParts.join('\n\n').trim();
}

async function checkForArticle(url: string): Promise<{
  isArticle: boolean;
  title?: string;
  description?: string;
  bodyText?: string;
  coverImage?: { url: string; width?: number; height?: number };
  articleId?: string;
} | null> {
  const match = url.match(/(?:twitter|x)\.com\/(\w+)\/status\/(\d+)/i);
  if (!match) return null;

  const [, username, tweetId] = match;
  const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as FxTwitterResponse;
    if (data.code !== 200 || !data.tweet) return null;

    const tweet = data.tweet;
    if (!tweet.article) {
      return { isArticle: false };
    }

    const article = tweet.article;
    const articleText = extractArticleText(article);

    return {
      isArticle: true,
      title: article.title,
      description: article.preview_text || articleText.slice(0, 500),
      bodyText: articleText,
      coverImage: article.cover_media?.media_info?.original_img_url
        ? {
            url: article.cover_media.media_info.original_img_url,
            width: article.cover_media.media_info.original_img_width,
            height: article.cover_media.media_info.original_img_height,
          }
        : undefined,
      articleId: article.id,
    };
  } catch (err) {
    console.error(`Error checking article for ${url}:`, err);
    return null;
  }
}

async function getCandidateItems() {
  // Find Twitter items that might be X Articles:
  // - Empty or very short body text
  // - Body text is just a t.co link
  // - Body text matches common X Article tweet patterns
  let query = supabase
    .from('content_items')
    .select('id, source_url, title, body_text, images, platform_data')
    .eq('source_type', 'twitter')
    .eq('status', 'complete')
    .or('body_text.is.null,body_text.eq.,body_text.ilike.https://t.co/%')
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

async function updateItem(
  id: string,
  updates: {
    title: string;
    description: string;
    bodyText: string;
    images?: Array<{ url: string; width?: number; height?: number }>;
    platformData: Record<string, unknown>;
  }
) {
  const { error } = await supabase
    .from('content_items')
    .update({
      title: updates.title,
      description: updates.description,
      body_text: updates.bodyText,
      images: updates.images,
      platform_data: updates.platformData,
      updated_at: new Date().toISOString(),
    })
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
  console.log('Backfill X Articles');
  console.log('='.repeat(60));
  if (DRY_RUN) {
    console.log('DRY RUN MODE - No changes will be made');
  }
  if (LIMIT) {
    console.log(`Limiting to ${LIMIT} items`);
  }
  console.log('');

  const candidates = await getCandidateItems();

  if (candidates.length === 0) {
    console.log('No candidate items found');
    return;
  }

  console.log(`Found ${candidates.length} candidate items to check`);
  console.log('');

  let checked = 0;
  let articlesFound = 0;
  let updated = 0;
  let errors = 0;

  for (const item of candidates) {
    checked++;
    const shortUrl =
      item.source_url.length > 60 ? item.source_url.substring(0, 60) + '...' : item.source_url;

    process.stdout.write(`[${checked}/${candidates.length}] Checking: ${shortUrl}... `);

    try {
      const result = await checkForArticle(item.source_url);

      if (!result) {
        console.log('API error, skipping');
        errors++;
        continue;
      }

      if (!result.isArticle) {
        console.log('Not an article');
        continue;
      }

      articlesFound++;
      console.log(`ARTICLE: "${result.title?.slice(0, 40)}..."`);

      if (!DRY_RUN) {
        // Build updated images array
        const existingImages = (item.images as Array<{ url: string }>) || [];
        const images = result.coverImage
          ? [result.coverImage, ...existingImages.filter((img) => img.url !== result.coverImage?.url)]
          : existingImages;

        // Update platform_data
        const platformData = {
          ...(item.platform_data as Record<string, unknown>),
          isArticle: true,
          articleId: result.articleId,
        };

        await updateItem(item.id, {
          title: result.title!,
          description: result.description!,
          bodyText: result.bodyText!,
          images,
          platformData,
        });

        updated++;
        console.log(`  ✓ Updated with ${result.bodyText!.length} chars of content`);
      }

      // Rate limiting - be nice to the API
      await sleep(200);
    } catch (err) {
      console.log(`ERROR: ${err}`);
      errors++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Items checked: ${checked}`);
  console.log(`X Articles found: ${articlesFound}`);
  console.log(`Items updated: ${updated}`);
  console.log(`Errors: ${errors}`);

  if (DRY_RUN && articlesFound > 0) {
    console.log('');
    console.log('Run without DRY_RUN=true to apply updates');
  }
}

main().catch(console.error);
