import { ApifyClient } from 'apify-client';
import type { ExtractedContent, MediaItem, VideoItem } from '@content-capture/core';
import type { ContentScraper, ScraperOptions } from './types';

const TWITTER_URL_PATTERNS = [
  /^https?:\/\/(www\.)?(twitter|x)\.com\/\w+\/status\/\d+/i,
  /^https?:\/\/(www\.)?(twitter|x)\.com\/\w+$/i,
];

interface ApifyTweetResult {
  id?: string;
  text?: string;
  full_text?: string;
  created_at?: string;
  user?: {
    name?: string;
    screen_name?: string;
    profile_image_url_https?: string;
  };
  entities?: {
    media?: Array<{
      media_url_https?: string;
      type?: string;
      video_info?: {
        duration_millis?: number;
        variants?: Array<{
          url?: string;
          bitrate?: number;
          content_type?: string;
        }>;
      };
    }>;
    urls?: Array<{
      expanded_url?: string;
    }>;
  };
  extended_entities?: {
    media?: Array<{
      media_url_https?: string;
      type?: string;
      video_info?: {
        duration_millis?: number;
        variants?: Array<{
          url?: string;
          bitrate?: number;
          content_type?: string;
        }>;
      };
    }>;
  };
  retweet_count?: number;
  favorite_count?: number;
  reply_count?: number;
}

/**
 * Twitter/X scraper using Apify actor
 */
export class TwitterScraper implements ContentScraper {
  name = 'twitter';
  private client: ApifyClient;

  constructor(apiToken?: string) {
    const token = apiToken || process.env.APIFY_API_TOKEN;
    if (!token) {
      throw new Error('Apify API token is required for Twitter scraper');
    }
    this.client = new ApifyClient({ token });
  }

  canHandle(url: string): boolean {
    return TWITTER_URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  async scrape(url: string, options?: ScraperOptions): Promise<ExtractedContent> {
    const timeout = options?.timeout || 60000;

    // Use Apify's Twitter Scraper actor
    // Actor ID: apidojo/tweet-scraper or similar
    const run = await this.client.actor('apidojo/tweet-scraper').call(
      {
        startUrls: [{ url }],
        maxTweets: 1,
        addUserInfo: true,
        proxyConfiguration: {
          useApifyProxy: true,
        },
      },
      {
        timeout: timeout / 1000, // Apify uses seconds
        waitSecs: 10,
      }
    );

    // Get results from dataset
    const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      throw new Error('No tweet data returned from Apify');
    }

    const tweet = items[0] as ApifyTweetResult;
    return this.parseTweet(tweet);
  }

  private parseTweet(tweet: ApifyTweetResult): ExtractedContent {
    const text = tweet.full_text || tweet.text || '';
    const user = tweet.user;

    // Extract images
    const images: MediaItem[] = [];
    const mediaEntities = tweet.extended_entities?.media || tweet.entities?.media || [];

    for (const media of mediaEntities) {
      if (media.type === 'photo' && media.media_url_https) {
        images.push({
          url: media.media_url_https,
        });
      }
    }

    // Extract videos
    const videos: VideoItem[] = [];
    for (const media of mediaEntities) {
      if ((media.type === 'video' || media.type === 'animated_gif') && media.video_info) {
        // Get highest quality video variant
        const variants = media.video_info.variants || [];
        const mp4Variants = variants.filter((v) => v.content_type === 'video/mp4');
        const bestVariant = mp4Variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

        if (bestVariant?.url) {
          videos.push({
            url: bestVariant.url,
            thumbnail: media.media_url_https,
            duration: media.video_info.duration_millis
              ? media.video_info.duration_millis / 1000
              : undefined,
          });
        }
      }
    }

    // Parse published date
    let publishedAt: string | undefined;
    if (tweet.created_at) {
      try {
        publishedAt = new Date(tweet.created_at).toISOString();
      } catch {
        // Invalid date format
      }
    }

    return {
      title: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
      description: text,
      bodyText: text,
      authorName: user?.name,
      authorHandle: user?.screen_name ? `@${user.screen_name}` : undefined,
      publishedAt,
      images,
      videos,
      platformData: {
        tweetId: tweet.id,
        retweetCount: tweet.retweet_count,
        likeCount: tweet.favorite_count,
        replyCount: tweet.reply_count,
        profileImageUrl: user?.profile_image_url_https,
      },
    };
  }
}
