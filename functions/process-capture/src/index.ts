import { CloudEvent } from '@google-cloud/functions-framework';
import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import type { CaptureMessage, ExtractedContent, AnalysisResult } from '@content-capture/core';
import { createScraperRegistry, getScraperForSourceType } from '@content-capture/scrapers';
import { createAnalyzer } from '@content-capture/analyzer';

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'content-capture-media';

// Initialize scraper registry and analyzer
const scraperRegistry = createScraperRegistry();
const analyzer = createAnalyzer();

interface PubSubMessage {
  data: string;
  attributes?: Record<string, string>;
}

/**
 * Cloud Function triggered by Pub/Sub
 * Processes captured URLs: scrape → analyze → store
 */
export async function processCapture(
  cloudEvent: CloudEvent<PubSubMessage>
): Promise<void> {
  const startTime = Date.now();

  // Decode the Pub/Sub message
  const messageData = cloudEvent.data?.data;
  if (!messageData) {
    console.error('No message data received');
    return;
  }

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

    // Step 2: Upload media to Cloud Storage
    console.log('Step 2: Uploading media...');
    const processedMedia = await processMedia(captureId, content);

    // Step 3: Analyze with Claude
    console.log('Step 3: Analyzing with Claude...');
    const analysis = await analyzer.analyze(content, sourceType, url);
    console.log(`Analysis: ${analysis.topics.join(', ')}`);

    // Step 4: Save to Supabase
    console.log('Step 4: Saving to database...');
    await saveToDatabase(captureId, url, content, analysis, processedMedia, notes);

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
): Promise<{ images: ProcessedMedia[]; videos: ProcessedMedia[] }> {
  const bucket = storage.bucket(bucketName);
  const processedImages: ProcessedMedia[] = [];
  const processedVideos: ProcessedMedia[] = [];

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

  return { images: processedImages, videos: processedVideos };
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
  media: { images: ProcessedMedia[]; videos: ProcessedMedia[] },
  notes?: string
): Promise<void> {
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

      // Platform metadata
      platform_data: {
        ...content.platformData,
        ...(notes ? { user_notes: notes } : {}),
      },

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

