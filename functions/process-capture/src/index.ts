import * as functions from '@google-cloud/functions-framework';
import { CloudEvent } from '@google-cloud/functions-framework';
import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import type {
  CaptureMessage,
  ExtractedContent,
  AnalysisResult,
  SourceType,
} from '@content-capture/core';
import {
  createScraperRegistry,
  getScraperForSourceType,
  TwitterScraper,
  extractLinksFromText,
  fetchThreadData,
  extractTweetId,
  scrapeLinks,
  type ThreadData,
  type ScrapedLinkContent,
} from '@content-capture/scrapers';
import { createAnalyzer, createEmbeddingsGenerator } from '@content-capture/analyzer';

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'content-capture-media';

const pubsub = new PubSub();
const topicName = process.env.GOOGLE_CLOUD_PUBSUB_TOPIC || 'content-capture';

// Initialize scraper registry, analyzer, and embeddings generator
const scraperRegistry = createScraperRegistry();
const analyzer = createAnalyzer();

// Embeddings generator is optional (requires OPENAI_API_KEY)
let embeddingsGenerator: ReturnType<typeof createEmbeddingsGenerator> | null = null;
if (process.env.OPENAI_API_KEY) {
  try {
    embeddingsGenerator = createEmbeddingsGenerator();
    console.log('Embeddings generator initialized');
  } catch (err) {
    console.warn('Failed to initialize embeddings generator:', err);
  }
} else {
  console.warn('OPENAI_API_KEY not set - embeddings disabled');
}

interface PubSubData {
  // Gen2 Eventarc format - data is at root level with snake_case keys
  data?: string;
  attributes?: Record<string, string>;
  message_id?: string;
  publish_time?: string;
  // Gen1 format - nested in message
  message?: {
    data: string;
    attributes?: Record<string, string>;
  };
}

/**
 * Cloud Function triggered by Pub/Sub
 * Processes captured URLs: scrape → analyze → store
 */
export async function processCapture(
  cloudEvent: CloudEvent<PubSubData>
): Promise<void> {
  const startTime = Date.now();

  // Gen2 Eventarc with Pub/Sub sends the message data directly in cloudEvent.data
  // The structure is: { data: "base64string", message_id: "...", publish_time: "..." }
  // where cloudEvent.data.data is the actual base64-encoded message payload
  const eventData = cloudEvent.data;

  // Log for debugging
  console.log('CloudEvent received. Keys:', Object.keys(eventData || {}));

  // In Gen2, the base64 data is at cloudEvent.data.data
  // Cast to any to access the property directly
  const rawData = eventData as any;
  let messageData: string | undefined;

  if (typeof rawData === 'string') {
    // Data is directly a string (unlikely but handle it)
    messageData = rawData;
  } else if (rawData && typeof rawData.data === 'string') {
    // Gen2 format: { data: "base64...", message_id: ... }
    messageData = rawData.data;
  } else if (rawData?.message?.data) {
    // Gen1 format: { message: { data: "base64..." } }
    messageData = rawData.message.data;
  }

  if (!messageData) {
    console.error('No message data found. eventData type:', typeof eventData, 'eventData:', JSON.stringify(eventData, null, 2));
    return;
  }

  console.log('Decoding message, length:', messageData.length);

  const message: CaptureMessage = JSON.parse(
    Buffer.from(messageData, 'base64').toString('utf-8')
  );

  const { captureId, url, sourceType, notes } = message;
  console.log(`Processing capture ${captureId}: ${url} (${sourceType})`);

  try {
    // Update status to processing
    await updateStatus(captureId, 'processing');

    // Step 1: Scrape content
    console.log('Step 1: Scraping content...');
    const scraper = getScraperForSourceType(sourceType, scraperRegistry);
    const content = await scraper.scrape(url);
    console.log(`Scraped: "${content.title}" with ${content.images.length} images`);

    // Step 1.5: Process thread if Twitter (for parent linking)
    let threadRootId: string | undefined;
    let threadPosition = 0;
    let parentId: string | undefined;

    if (sourceType === 'twitter' && content.threadContext?.isThreadContinuation) {
      console.log('Step 1.5: Processing Twitter thread parent...');
      const threadResult = await processThread(captureId, content, url);
      threadRootId = threadResult.threadRootId;
      threadPosition = threadResult.threadPosition;
      parentId = threadResult.parentId;
    }

    // Step 1.6: Enrich Twitter content (fetch thread + scrape links)
    let twitterEnrichment: { threadData: ThreadData | null; linkedContent: ScrapedLinkContent[] } | null = null;
    if (sourceType === 'twitter') {
      console.log('Step 1.6: Enriching Twitter content...');
      twitterEnrichment = await enrichTwitterContent(content, url);
    }

    // Step 2: Upload media to Cloud Storage
    console.log('Step 2: Uploading media...');
    const processedMedia = await processMedia(captureId, content);

    // Step 3: Analyze with Claude
    console.log('Step 3: Analyzing with Claude...');
    const analysis = await analyzer.analyze(content, sourceType, url);
    console.log(`Analysis: ${analysis.topics.join(', ')}`);

    // Step 3.5: Generate embedding
    let embedding: number[] | undefined;
    if (embeddingsGenerator) {
      console.log('Step 3.5: Generating embedding...');
      try {
        embedding = await embeddingsGenerator.generateContentEmbedding({
          title: content.title,
          description: content.description,
          bodyText: content.bodyText,
          summary: analysis.summary,
          topics: analysis.topics,
          authorName: content.authorName,
        });
        console.log(`Generated embedding with ${embedding.length} dimensions`);
      } catch (err) {
        console.warn('Failed to generate embedding:', err);
      }
    }

    // Step 4: Save to Supabase
    console.log('Step 4: Saving to database...');
    await saveToDatabase(
      captureId,
      url,
      content,
      analysis,
      processedMedia,
      notes,
      { threadRootId, threadPosition, parentId },
      embedding,
      twitterEnrichment
    );

    const duration = Date.now() - startTime;
    console.log(`Capture ${captureId} completed in ${duration}ms`);

  } catch (error) {
    console.error(`Error processing capture ${captureId}:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateStatus(captureId, 'failed', errorMessage);

    // Re-throw to trigger Pub/Sub retry
    throw error;
  }
}

/**
 * Update capture status in database
 */
async function updateStatus(
  captureId: string,
  status: 'processing' | 'complete' | 'failed',
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase
    .from('content_items')
    .update({
      status,
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
      ...(status === 'complete' ? { processed_at: new Date().toISOString() } : {}),
    })
    .eq('id', captureId);

  if (error) {
    console.error('Failed to update status:', error);
  }
}

/**
 * Process and upload media to Cloud Storage
 */
async function processMedia(
  captureId: string,
  content: ExtractedContent
): Promise<{ images: ProcessedMedia[]; videos: ProcessedMedia[]; screenshot?: string }> {
  const bucket = storage.bucket(bucketName);
  const processedImages: ProcessedMedia[] = [];
  const processedVideos: ProcessedMedia[] = [];
  let screenshotUrl: string | undefined;

  // Process images
  for (let i = 0; i < content.images.length; i++) {
    const image = content.images[i];
    if (!image?.url) continue;

    try {
      const gcsPath = `captures/${captureId}/images/${i}.jpg`;
      const publicUrl = await downloadAndUpload(image.url, bucket, gcsPath);

      processedImages.push({
        originalUrl: image.url,
        gcsPath,
        publicUrl,
        width: image.width,
        height: image.height,
        alt: image.alt,
      });
    } catch (err) {
      console.warn(`Failed to upload image ${i}:`, err);
      // Keep original URL as fallback
      processedImages.push({
        originalUrl: image.url,
        width: image.width,
        height: image.height,
        alt: image.alt,
      });
    }
  }

  // Process videos (just store metadata, don't download full videos)
  for (const video of content.videos) {
    if (!video?.url) continue;

    processedVideos.push({
      originalUrl: video.url,
      thumbnail: video.thumbnail,
      duration: video.duration,
    });
  }

  // Process screenshot if available
  if (content.screenshot) {
    try {
      const gcsPath = `captures/${captureId}/screenshot.jpg`;
      
      if (content.screenshot.startsWith('data:')) {
        // Base64 data URL - extract and upload
        const base64Data = content.screenshot.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const file = bucket.file(gcsPath);
        
        await file.save(buffer, {
          metadata: { contentType: 'image/jpeg' },
        });
        await file.makePublic();
        
        screenshotUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
      } else if (content.screenshot.startsWith('http')) {
        // URL from screenshot service - download and upload to our storage
        screenshotUrl = await downloadAndUpload(content.screenshot, bucket, gcsPath);
      }
      
      console.log(`Screenshot saved: ${screenshotUrl}`);
    } catch (err) {
      console.warn('Failed to process screenshot:', err);
      // Keep the original URL as fallback if it's a direct URL
      if (content.screenshot.startsWith('http')) {
        screenshotUrl = content.screenshot;
      }
    }
  }

  return { images: processedImages, videos: processedVideos, screenshot: screenshotUrl };
}

interface ProcessedMedia {
  originalUrl: string;
  gcsPath?: string;
  publicUrl?: string;
  width?: number;
  height?: number;
  alt?: string;
  thumbnail?: string;
  duration?: number;
}

/**
 * Download file from URL and upload to Cloud Storage
 */
async function downloadAndUpload(
  url: string,
  bucket: ReturnType<typeof storage.bucket>,
  destination: string
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const file = bucket.file(destination);

  await file.save(buffer, {
    metadata: {
      contentType: response.headers.get('content-type') || 'image/jpeg',
    },
  });

  // Make publicly accessible
  await file.makePublic();

  return `https://storage.googleapis.com/${bucketName}/${destination}`;
}

/**
 * Save processed capture to database
 */
async function saveToDatabase(
  captureId: string,
  url: string,
  content: ExtractedContent,
  analysis: AnalysisResult,
  media: { images: ProcessedMedia[]; videos: ProcessedMedia[]; screenshot?: string },
  notes?: string,
  threadInfo?: { threadRootId?: string; threadPosition?: number; parentId?: string },
  embedding?: number[],
  twitterEnrichment?: { threadData: ThreadData | null; linkedContent: ScrapedLinkContent[] } | null
): Promise<void> {
  // Build platform_data with enrichment
  const platformData: Record<string, unknown> = {
    ...content.platformData,
    ...(notes ? { user_notes: notes } : {}),
    ...(media.screenshot ? { screenshot: media.screenshot } : {}),
  };

  // Add Twitter enrichment data if available
  if (twitterEnrichment) {
    if (twitterEnrichment.threadData) {
      platformData.thread = twitterEnrichment.threadData;
      platformData.threadLength = twitterEnrichment.threadData.tweetCount;
    }
    if (twitterEnrichment.linkedContent.length > 0) {
      platformData.linked_content = twitterEnrichment.linkedContent;
    }
    platformData.enriched_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('content_items')
    .update({
      // Extracted content
      title: content.title,
      description: content.description,
      body_text: content.bodyText,
      author_name: content.authorName,
      author_handle: content.authorHandle,
      published_at: content.publishedAt,

      // Media
      images: media.images,
      videos: media.videos,

      // Analysis
      summary: analysis.summary,
      topics: analysis.topics,
      disciplines: [analysis.discipline],
      use_cases: analysis.useCases,
      content_type: analysis.contentType,

      // Thread info
      ...(threadInfo?.threadRootId ? { thread_root_id: threadInfo.threadRootId } : {}),
      ...(threadInfo?.parentId ? { parent_id: threadInfo.parentId } : {}),
      ...(threadInfo?.threadPosition !== undefined
        ? { thread_position: threadInfo.threadPosition }
        : {}),

      // Embedding (pgvector format)
      ...(embedding
        ? {
            embedding: `[${embedding.join(',')}]`,
            embedding_generated_at: new Date().toISOString(),
          }
        : {}),

      // Platform metadata (now includes thread and linked content)
      platform_data: platformData,

      // Status
      status: 'complete',
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', captureId);

  if (error) {
    throw new Error(`Database save failed: ${error.message}`);
  }
}

/**
 * Process Twitter thread - find and capture parent tweets
 */
async function processThread(
  captureId: string,
  content: ExtractedContent,
  url: string
): Promise<{ threadRootId?: string; threadPosition: number; parentId?: string }> {
  const authorHandle = content.authorHandle;
  const parentTweetId = content.threadContext?.parentTweetId;

  if (!authorHandle || !parentTweetId) {
    return { threadPosition: 0 };
  }

  // Get the Twitter scraper
  const twitterScraper = scraperRegistry.getByName('twitter') as TwitterScraper | undefined;
  if (!twitterScraper) {
    console.warn('Twitter scraper not available for thread processing');
    return { threadPosition: 0 };
  }

  // Check if parent tweet already exists in our database
  const { data: existingParent } = await supabase
    .from('content_items')
    .select('id, thread_root_id, thread_position')
    .eq('platform_data->>tweetId', parentTweetId)
    .single();

  if (existingParent) {
    // Parent exists - link to it
    const threadRootId = existingParent.thread_root_id || existingParent.id;
    const threadPosition = (existingParent.thread_position || 0) + 1;
    return {
      parentId: existingParent.id,
      threadRootId,
      threadPosition,
    };
  }

  // Parent doesn't exist - fetch and create capture for it
  try {
    const parentUrl = `https://x.com/${authorHandle.replace('@', '')}/status/${parentTweetId}`;

    // Create a pending capture for the parent
    const { data: parentCapture, error: createError } = await supabase
      .from('content_items')
      .insert({
        source_url: parentUrl,
        source_type: 'twitter',
        status: 'pending',
        captured_at: new Date().toISOString(),
        images: [],
        videos: [],
        topics: [],
        disciplines: [],
        use_cases: [],
        platform_data: { queued_from_thread: captureId },
      })
      .select('id')
      .single();

    if (createError) {
      // Might be a duplicate - check again
      const { data: retryParent } = await supabase
        .from('content_items')
        .select('id, thread_root_id, thread_position')
        .eq('source_url', parentUrl)
        .single();

      if (retryParent) {
        const threadRootId = retryParent.thread_root_id || retryParent.id;
        return {
          parentId: retryParent.id,
          threadRootId,
          threadPosition: (retryParent.thread_position || 0) + 1,
        };
      }
      console.warn('Failed to create parent capture:', createError);
      return { threadPosition: 0 };
    }

    // Queue the parent for processing
    const message: CaptureMessage = {
      captureId: parentCapture.id,
      url: parentUrl,
      sourceType: 'twitter',
    };

    await pubsub.topic(topicName).publishMessage({
      data: Buffer.from(JSON.stringify(message)),
      attributes: {
        sourceType: 'twitter',
        captureId: parentCapture.id,
        isThreadParent: 'true',
      },
    });

    console.log(`Queued parent tweet ${parentTweetId} for processing`);

    // Return thread info - parent will be the root for now
    // (will be updated when parent is processed)
    return {
      parentId: parentCapture.id,
      threadRootId: parentCapture.id,
      threadPosition: 1,
    };
  } catch (err) {
    console.warn('Error processing thread parent:', err);
    return { threadPosition: 0 };
  }
}

/**
 * Fetch thread data and scrape linked content for inline storage
 * Returns enriched data to be stored in platform_data
 */
async function enrichTwitterContent(
  content: ExtractedContent,
  url: string
): Promise<{ threadData: ThreadData | null; linkedContent: ScrapedLinkContent[] }> {
  const tweetId = extractTweetId(url);
  const authorHandle = content.authorHandle;

  let threadData: ThreadData | null = null;
  let allLinks: string[] = [];

  // Fetch thread data if we have the required info
  if (tweetId && authorHandle) {
    console.log('Fetching thread data...');
    threadData = await fetchThreadData(tweetId, authorHandle);

    if (threadData) {
      console.log(`Found thread: ${threadData.tweetCount} tweets, ${threadData.links.length} links (via ${threadData.source})`);
      allLinks.push(...threadData.links);
    }
  }

  // Extract links from tweet body
  const bodyText = content.bodyText || content.description || '';
  const bodyLinks = extractLinksFromText(bodyText);
  allLinks.push(...bodyLinks);

  // Deduplicate links
  allLinks = [...new Set(allLinks)];
  console.log(`Total unique links to scrape: ${allLinks.length}`);

  // Scrape linked content (limit to 5)
  let linkedContent: ScrapedLinkContent[] = [];
  if (allLinks.length > 0) {
    console.log('Scraping linked content...');
    linkedContent = await scrapeLinks(allLinks, 5, 500);
    const successCount = linkedContent.filter(l => !l.error).length;
    console.log(`Scraped ${successCount}/${linkedContent.length} links successfully`);
  }

  return { threadData, linkedContent };
}

/**
 * Detect source type from URL
 */
function detectSourceType(url: string): SourceType {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'twitter';
  if (lowerUrl.includes('instagram.com')) return 'instagram';
  if (lowerUrl.includes('linkedin.com')) return 'linkedin';
  if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) return 'pinterest';
  return 'web';
}

// Register the function with the Functions Framework for Gen2
functions.cloudEvent('processCapture', processCapture);

