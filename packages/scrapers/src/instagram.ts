import { ApifyClient } from 'apify-client';
import type { ExtractedContent, MediaItem, VideoItem } from '@content-capture/core';
import type { ContentScraper, ScraperOptions } from './types';

const INSTAGRAM_URL_PATTERNS = [
  /^https?:\/\/(www\.)?instagram\.com\/p\/[\w-]+/i, // Posts
  /^https?:\/\/(www\.)?instagram\.com\/reel\/[\w-]+/i, // Reels
  /^https?:\/\/(www\.)?instagram\.com\/[\w.]+\/?$/i, // Profiles
];

interface ApifyInstagramResult {
  id?: string;
  shortCode?: string;
  caption?: string;
  type?: string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
  ownerUsername?: string;
  ownerFullName?: string;
  displayUrl?: string;
  videoUrl?: string;
  videoDuration?: number;
  images?: string[];
  childPosts?: Array<{
    type?: string;
    displayUrl?: string;
    videoUrl?: string;
  }>;
}

/**
 * Instagram scraper using Apify actor
 */
export class InstagramScraper implements ContentScraper {
  name = 'instagram';
  private client: ApifyClient;

  constructor(apiToken?: string) {
    const token = apiToken || process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new Error('Apify API token is required for Instagram scraper');
    }
    this.client = new ApifyClient({ token });
  }

  canHandle(url: string): boolean {
    return INSTAGRAM_URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  async scrape(url: string, options?: ScraperOptions): Promise<ExtractedContent> {
    const timeout = options?.timeout || 60000;

    // Use Apify's Instagram Scraper actor
    const run = await this.client.actor('apify/instagram-scraper').call(
      {
        directUrls: [url],
        resultsType: 'posts',
        resultsLimit: 1,
        addParentData: true,
        proxy: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL'],
        },
      },
      {
        timeout: timeout / 1000,
        waitSecs: 15,
      }
    );

    // Get results from dataset
    const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      throw new Error('No Instagram data returned from Apify');
    }

    const post = items[0] as ApifyInstagramResult;
    return this.parsePost(post);
  }

  private parsePost(post: ApifyInstagramResult): ExtractedContent {
    const caption = post.caption || '';

    // Extract images
    const images: MediaItem[] = [];

    // Main display image
    if (post.displayUrl) {
      images.push({ url: post.displayUrl });
    }

    // Carousel images
    if (post.childPosts) {
      for (const child of post.childPosts) {
        if (child.type === 'Image' && child.displayUrl) {
          images.push({ url: child.displayUrl });
        }
      }
    }

    // Additional images array
    if (post.images) {
      for (const imgUrl of post.images) {
        if (!images.some((img) => img.url === imgUrl)) {
          images.push({ url: imgUrl });
        }
      }
    }

    // Extract videos
    const videos: VideoItem[] = [];

    // Main video
    if (post.videoUrl) {
      videos.push({
        url: post.videoUrl,
        thumbnail: post.displayUrl,
        duration: post.videoDuration,
      });
    }

    // Carousel videos
    if (post.childPosts) {
      for (const child of post.childPosts) {
        if (child.type === 'Video' && child.videoUrl) {
          videos.push({
            url: child.videoUrl,
            thumbnail: child.displayUrl,
          });
        }
      }
    }

    // Parse timestamp
    let publishedAt: string | undefined;
    if (post.timestamp) {
      try {
        publishedAt = new Date(post.timestamp).toISOString();
      } catch {
        // Invalid timestamp
      }
    }

    // Create title from caption (first line or truncated)
    const firstLine = caption.split('\n')[0] || '';
    const title = firstLine.slice(0, 100) + (firstLine.length > 100 ? '...' : '') || 'Instagram Post';

    return {
      title,
      description: caption.slice(0, 500),
      bodyText: caption,
      authorName: post.ownerFullName,
      authorHandle: post.ownerUsername ? `@${post.ownerUsername}` : undefined,
      publishedAt,
      images,
      videos,
      platformData: {
        postId: post.id,
        shortCode: post.shortCode,
        type: post.type,
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
      },
    };
  }
}
