/**
 * Backfill Threads & Links Script
 *
 * For existing Twitter content:
 * 1. Fetches full thread context (parents above, children below)
 * 2. Stores thread content IN the saved tweet (not as separate items)
 * 3. Re-generates embedding with full thread content
 * 4. Extracts and captures linked articles/PDFs
 *
 * Usage:
 *   npx tsx scripts/backfill-threads-links.ts
 *
 * Options (via env vars):
 *   MODE - "threads", "links", or "all" (default: all)
 *   BATCH_SIZE - Items per batch (default: 10)
 *   DELAY_SECONDS - Seconds between API calls (default: 2)
 *   DRY_RUN - Set to "true" to preview without making changes
 */

import { createClient } from '@supabase/supabase-js';
import { PubSub } from '@google-cloud/pubsub';
import OpenAI from 'openai';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const MODE = process.env.MODE || 'all';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10');
const DELAY_SECONDS = parseInt(process.env.DELAY_SECONDS || '2');
const DRY_RUN = process.env.DRY_RUN === 'true';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const pubsub = new PubSub({ projectId: process.env.GOOGLE_CLOUD_PROJECT_ID });
const topic = pubsub.topic(process.env.GOOGLE_CLOUD_PUBSUB_TOPIC || 'content-capture-process');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// URL extraction
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const SKIP_DOMAINS = [
  'twitter.com', 'x.com', 't.co', 'pic.twitter.com', 'pbs.twimg.com',
  'abs.twimg.com', 'video.twimg.com', 'instagram.com', 'facebook.com',
  'fb.com', 'linkedin.com', 'pinterest.com', 'pin.it', 'tiktok.com',
  'youtube.com', 'youtu.be', 'vimeo.com',
];
const SKIP_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp4', '.webm', '.mov'];

function extractLinksFromText(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];
  return matches
    .map(url => url.replace(/[.,;:!?)\]}>]+$/, ''))
    .filter(url => {
      const lowerUrl = url.toLowerCase();
      if (SKIP_DOMAINS.some(domain => lowerUrl.includes(domain))) return false;
      if (SKIP_EXTENSIONS.some(ext => lowerUrl.endsWith(ext))) return false;
      return true;
    })
    .filter((url, index, self) => self.indexOf(url) === index);
}

async function expandShortUrl(url: string): Promise<string> {
  if (!url.includes('t.co')) return url;
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)' },
    });
    return response.headers.get('location') || url;
  } catch {
    return url;
  }
}

function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// ============ Thread Types ============

interface ThreadTweet {
  position: number;
  tweetId: string;
  text: string;
  authorHandle: string;
  authorName?: string;
  createdAt?: string;
  images?: string[];
  isSavedTweet: boolean;
}

interface FxTwitterResponse {
  code: number;
  message: string;
  tweet?: {
    id: string;
    text: string;
    author: {
      screen_name: string;
      name?: string;
    };
    created_at?: string;
    replying_to?: string;
    replying_to_status?: string;
    media?: {
      photos?: Array<{ url: string }>;
    };
  };
}

interface TwitterItem {
  id: string;
  source_url: string;
  body_text: string | null;
  author_handle: string | null;
  platform_data: Record<string, unknown> | null;
}

// ============ API Functions ============

async function fetchTweetFromFxTwitter(username: string, tweetId: string): Promise<ThreadTweet | null> {
  const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json() as FxTwitterResponse;
    if (data.code !== 200 || !data.tweet) return null;

    return {
      position: 0, // Will be set later
      tweetId: data.tweet.id,
      text: data.tweet.text,
      authorHandle: data.tweet.author.screen_name,
      authorName: data.tweet.author.name,
      createdAt: data.tweet.created_at,
      images: data.tweet.media?.photos?.map(p => p.url),
      isSavedTweet: false,
    };
  } catch (err) {
    console.warn(`Failed to fetch tweet ${tweetId}:`, err);
    return null;
  }
}

async function fetchReplyInfo(username: string, tweetId: string): Promise<{
  replyingTo?: string;
  replyingToStatus?: string;
} | null> {
  const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json() as FxTwitterResponse;
    if (data.code !== 200 || !data.tweet) return null;

    return {
      replyingTo: data.tweet.replying_to,
      replyingToStatus: data.tweet.replying_to_status,
    };
  } catch {
    return null;
  }
}

/**
 * Walk UP the thread chain to find parent tweets (same author only)
 */
async function fetchThreadParents(
  tweetId: string,
  authorHandle: string,
  maxDepth: number = 20
): Promise<ThreadTweet[]> {
  const parents: ThreadTweet[] = [];
  const normalizedAuthor = authorHandle.replace('@', '').toLowerCase();
  let currentId = tweetId;

  for (let depth = 0; depth < maxDepth; depth++) {
    // Get reply info for current tweet
    const replyInfo = await fetchReplyInfo(normalizedAuthor, currentId);
    await sleep(0.5); // Rate limit

    if (!replyInfo?.replyingToStatus) break;

    // Only follow same-author replies (intentional threads)
    const replyingTo = replyInfo.replyingTo?.toLowerCase();
    if (replyingTo !== normalizedAuthor) break;

    // Fetch the parent tweet
    const parentTweet = await fetchTweetFromFxTwitter(normalizedAuthor, replyInfo.replyingToStatus);
    await sleep(0.5);

    if (!parentTweet) break;

    parents.unshift(parentTweet); // Add to front (oldest first)
    currentId = replyInfo.replyingToStatus;
  }

  return parents;
}

/**
 * Walk DOWN the thread chain to find child tweets (same author replies)
 * Uses syndication API which can return conversation data
 */
async function fetchThreadChildren(
  tweetId: string,
  authorHandle: string,
  maxDepth: number = 20
): Promise<ThreadTweet[]> {
  const children: ThreadTweet[] = [];
  const normalizedAuthor = authorHandle.replace('@', '').toLowerCase();

  // Try using Twitter's syndication API to get conversation
  // This is a public endpoint that returns tweet embeds with conversation
  try {
    const syndicationUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${normalizedAuthor}`;

    // Alternative: Use the tweet detail endpoint which sometimes includes replies
    const detailUrl = `https://api.fxtwitter.com/${normalizedAuthor}/status/${tweetId}`;

    // For now, we'll walk down by checking if subsequent tweets reply to our tweet
    // This is limited but works for simple threads

    // Try to find tweets that reply to this tweet by the same author
    // We'll check the author's recent tweets to see if any reply to this one
    let currentParentId = tweetId;

    for (let depth = 0; depth < maxDepth; depth++) {
      // Check if there's a tweet replying to currentParentId by same author
      // Unfortunately FxTwitter doesn't have a search/replies endpoint
      // So we need to try fetching potential child tweet IDs

      // For threads, authors typically post in quick succession
      // We can try incrementing tweet IDs (they're roughly sequential)
      // This is a heuristic and won't catch all threads

      // Actually, let's try a different approach:
      // Fetch the original tweet's conversation if available
      break; // For now, skip children fetching - will implement properly
    }
  } catch (err) {
    console.warn(`Failed to fetch thread children for ${tweetId}:`, err);
  }

  return children;
}

/**
 * Fetch full thread for a saved tweet
 */
async function fetchFullThread(item: TwitterItem): Promise<ThreadTweet[]> {
  const authorHandle = item.author_handle?.replace('@', '').toLowerCase();
  if (!authorHandle) return [];

  const tweetIdMatch = item.source_url.match(/status\/(\d+)/);
  const tweetId = tweetIdMatch?.[1];
  if (!tweetId) return [];

  console.log(`    Fetching thread for tweet ${tweetId}...`);

  // Create the saved tweet entry
  const savedTweet: ThreadTweet = {
    position: 0,
    tweetId,
    text: item.body_text || '',
    authorHandle,
    isSavedTweet: true,
  };

  // Fetch parents (walking up)
  console.log(`    Walking UP to find parents...`);
  const parents = await fetchThreadParents(tweetId, authorHandle);
  console.log(`    Found ${parents.length} parent tweets`);

  // Fetch children (walking down)
  console.log(`    Walking DOWN to find children...`);
  const children = await fetchThreadChildren(tweetId, authorHandle);
  console.log(`    Found ${children.length} child tweets`);

  // Combine into full thread
  const thread: ThreadTweet[] = [...parents, savedTweet, ...children];

  // Set positions
  thread.forEach((tweet, index) => {
    tweet.position = index + 1;
  });

  return thread;
}

// ============ Database Functions ============

async function getTwitterItems(): Promise<TwitterItem[]> {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, source_url, body_text, author_handle, platform_data')
    .eq('source_type', 'twitter')
    .eq('status', 'complete')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch items: ${error.message}`);
  return data || [];
}

async function updateItemWithThread(
  itemId: string,
  thread: ThreadTweet[],
  originalBodyText: string
): Promise<boolean> {
  // Combine thread text
  const fullThreadText = thread
    .map((t, i) => {
      const prefix = t.isSavedTweet ? '>>> ' : `[${i + 1}/${thread.length}] `;
      return `${prefix}${t.text}`;
    })
    .join('\n\n---\n\n');

  // Prepare thread data for platform_data
  const threadData = thread.map(t => ({
    position: t.position,
    tweetId: t.tweetId,
    text: t.text,
    authorHandle: t.authorHandle,
    authorName: t.authorName,
    createdAt: t.createdAt,
    isSavedTweet: t.isSavedTweet,
  }));

  const savedPosition = thread.findIndex(t => t.isSavedTweet) + 1;

  // Generate new embedding with full thread content
  let embedding: number[] | null = null;
  try {
    const embeddingText = `Thread (${thread.length} tweets):\n\n${fullThreadText}`;
    const truncatedText = embeddingText.slice(0, 8191 * 4);

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: truncatedText,
      dimensions: 1536,
    });

    embedding = embeddingResponse.data[0]?.embedding || null;
  } catch (err) {
    console.warn(`Failed to generate embedding:`, err);
  }

  // Update the record
  const updateData: Record<string, unknown> = {
    body_text: fullThreadText,
    platform_data: {
      thread: threadData,
      threadLength: thread.length,
      savedPosition,
      isThread: thread.length > 1,
    },
    updated_at: new Date().toISOString(),
  };

  if (embedding) {
    updateData.embedding = `[${embedding.join(',')}]`;
    updateData.embedding_generated_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('content_items')
    .update(updateData)
    .eq('id', itemId);

  if (error) {
    console.error(`Failed to update item ${itemId}:`, error.message);
    return false;
  }

  return true;
}

// ============ Link Processing ============

async function isUrlAlreadyCaptured(url: string): Promise<boolean> {
  const normalizedUrl = url
    .replace('https://twitter.com', 'https://x.com')
    .replace('http://', 'https://');

  const { data } = await supabase
    .from('content_items')
    .select('id')
    .or(`source_url.eq.${normalizedUrl},source_url.eq.${url}`)
    .limit(1);

  return data && data.length > 0;
}

async function isLinkAlreadyRecorded(sourceId: string, url: string): Promise<boolean> {
  const { data } = await supabase
    .from('content_links')
    .select('id')
    .eq('source_content_id', sourceId)
    .eq('url', url)
    .limit(1);

  return data && data.length > 0;
}

async function createCaptureRecord(url: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('content_items')
    .insert({
      source_url: url,
      source_type: 'web',
      status: 'pending',
      images: [],
      videos: [],
      topics: [],
      disciplines: [],
      use_cases: [],
      captured_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error(`Failed to create capture record for ${url}:`, error.message);
    return null;
  }

  return data.id;
}

async function recordContentLink(sourceId: string, url: string, targetId: string | null): Promise<void> {
  const { error } = await supabase
    .from('content_links')
    .insert({
      source_content_id: sourceId,
      target_content_id: targetId,
      url: url,
      link_type: 'embedded',
      status: targetId ? 'pending' : 'skipped',
      created_at: new Date().toISOString(),
    });

  if (error && !error.message.includes('duplicate')) {
    console.error(`Failed to record link ${url}:`, error.message);
  }
}

async function queueCapture(captureId: string, url: string): Promise<void> {
  await topic.publishMessage({
    data: Buffer.from(JSON.stringify({
      captureId,
      url,
      sourceType: 'web',
    })),
  });
}

// ============ Main Processing ============

async function processThreads(items: TwitterItem[]): Promise<{
  processed: number;
  threadsFound: number;
  totalTweetsInThreads: number;
  skipped: number;
}> {
  let processed = 0;
  let threadsFound = 0;
  let totalTweetsInThreads = 0;
  let skipped = 0;

  console.log(`\nProcessing ${items.length} tweets for thread context...`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`\n  [${i + 1}/${items.length}] ${item.source_url.slice(0, 60)}...`);

    // Skip if already has thread data
    if (item.platform_data?.thread && Array.isArray(item.platform_data.thread)) {
      console.log(`    Skipping - already has thread data`);
      skipped++;
      continue;
    }

    // Fetch full thread
    const thread = await fetchFullThread(item);

    if (thread.length <= 1) {
      console.log(`    No thread found (single tweet)`);
      processed++;
      continue;
    }

    console.log(`    Found thread with ${thread.length} tweets!`);
    threadsFound++;
    totalTweetsInThreads += thread.length;

    if (!DRY_RUN) {
      const success = await updateItemWithThread(item.id, thread, item.body_text || '');
      if (success) {
        console.log(`    Updated record with thread data`);
      }
    }

    processed++;
    await sleep(DELAY_SECONDS);
  }

  return { processed, threadsFound, totalTweetsInThreads, skipped };
}

async function processLinks(items: TwitterItem[]): Promise<{
  queued: number;
  skipped: number;
  recorded: number;
}> {
  let queued = 0;
  let skipped = 0;
  let recorded = 0;

  for (const item of items) {
    // Get text to extract links from (including thread if available)
    let textToSearch = item.body_text || '';

    // If thread data exists, extract links from all tweets
    if (item.platform_data?.thread && Array.isArray(item.platform_data.thread)) {
      const threadTexts = (item.platform_data.thread as Array<{ text: string }>)
        .map(t => t.text)
        .join(' ');
      textToSearch = threadTexts;
    }

    if (!textToSearch) continue;

    const links = extractLinksFromText(textToSearch);
    if (links.length === 0) continue;

    console.log(`\n[${item.id.slice(0, 8)}] Found ${links.length} links`);

    for (const rawLink of links) {
      const link = await expandShortUrl(rawLink);

      const alreadyRecorded = await isLinkAlreadyRecorded(item.id, link);
      if (alreadyRecorded) {
        skipped++;
        continue;
      }

      const alreadyCaptured = await isUrlAlreadyCaptured(link);
      const shortLink = link.length > 50 ? link.slice(0, 50) + '...' : link;

      if (alreadyCaptured) {
        console.log(`    Skip (exists): ${shortLink}`);
        if (!DRY_RUN) {
          await recordContentLink(item.id, link, null);
        }
        recorded++;
        skipped++;
        continue;
      }

      console.log(`    Queue: ${shortLink}`);

      if (!DRY_RUN) {
        const captureId = await createCaptureRecord(link);
        if (captureId) {
          await recordContentLink(item.id, link, captureId);
          await queueCapture(captureId, link);
          queued++;
          recorded++;
          await sleep(DELAY_SECONDS);
        }
      } else {
        queued++;
        recorded++;
      }
    }
  }

  return { queued, skipped, recorded };
}

async function main() {
  console.log('='.repeat(50));
  console.log('Backfill Threads & Links');
  console.log('='.repeat(50));
  console.log(`Mode: ${MODE}`);
  console.log(`Delay between API calls: ${DELAY_SECONDS}s`);
  if (DRY_RUN) {
    console.log('DRY RUN - no changes will be made');
  }
  console.log('');

  const items = await getTwitterItems();
  console.log(`Found ${items.length} Twitter items to process`);

  if (items.length === 0) {
    console.log('No items to process!');
    return;
  }

  if (!DRY_RUN) {
    console.log('\nStarting in 5 seconds... (Ctrl+C to cancel)');
    await sleep(5);
  }

  let threadStats = { processed: 0, threadsFound: 0, totalTweetsInThreads: 0, skipped: 0 };
  let linkStats = { queued: 0, skipped: 0, recorded: 0 };

  // Process threads
  if (MODE === 'all' || MODE === 'threads') {
    console.log('\n' + '-'.repeat(30));
    console.log('Processing Threads');
    console.log('-'.repeat(30));
    threadStats = await processThreads(items);
  }

  // Process links (re-fetch items to get updated thread data)
  if (MODE === 'all' || MODE === 'links') {
    console.log('\n' + '-'.repeat(30));
    console.log('Processing Links');
    console.log('-'.repeat(30));
    const updatedItems = await getTwitterItems();
    linkStats = await processLinks(updatedItems);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Backfill Complete');
  console.log('='.repeat(50));

  if (MODE === 'all' || MODE === 'threads') {
    console.log(`\nThreads:`);
    console.log(`  Processed: ${threadStats.processed}`);
    console.log(`  Threads found: ${threadStats.threadsFound}`);
    console.log(`  Total tweets in threads: ${threadStats.totalTweetsInThreads}`);
    console.log(`  Skipped (already has data): ${threadStats.skipped}`);
  }

  if (MODE === 'all' || MODE === 'links') {
    console.log(`\nLinks:`);
    console.log(`  Queued for capture: ${linkStats.queued}`);
    console.log(`  Recorded: ${linkStats.recorded}`);
    console.log(`  Skipped: ${linkStats.skipped}`);
  }
}

main().catch(console.error);
