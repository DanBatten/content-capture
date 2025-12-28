import { ApifyClient } from 'apify-client';
import type { ExtractedContent, MediaItem, VideoItem, ThreadContext } from '@content-capture/core';
import type { ContentScraper, ScraperOptions } from './types';

const TWITTER_URL_PATTERNS = [
  /^https?:\/\/(www\.)?(twitter|x)\.com\/\w+\/status\/\d+/i,
  /^https?:\/\/(www\.)?(twitter|x)\.com\/\w+$/i,
];

// FxTwitter API response interface
interface FxTwitterResponse {
  code: number;
  message: string;
  tweet?: {
    url: string;
    id: string;
    text: string;
    author: {
      id: string;
      name: string;
      screen_name: string;
      avatar_url?: string;
      banner_url?: string;
      description?: string;
      location?: string;
      followers?: number;
      following?: number;
      joined?: string;
      tweets?: number;
    };
    replies?: number;
    retweets?: number;
    likes?: number;
    bookmarks?: number;
    created_at?: string;
    created_timestamp?: number;
    views?: number;
    lang?: string;
    replying_to?: string;
    replying_to_status?: string;
    media?: {
      photos?: Array<{
        url: string;
        width?: number;
        height?: number;
      }>;
      videos?: Array<{
        url: string;
        thumbnail_url?: string;
        duration?: number;
        width?: number;
        height?: number;
      }>;
    };
  };
}

// Different Apify actors return different data formats
interface ApifyTweetResult {
  id?: string;
  id_str?: string;
  tweetId?: string;
  rest_id?: string;
  text?: string;
  full_text?: string;
  rawContent?: string;
  content?: string;
  created_at?: string;
  createdAt?: string;
  date?: string;
  user?: {
    name?: string;
    screen_name?: string;
    profile_image_url_https?: string;
  };
  author?: {
    userName?: string;
    displayName?: string;
    profileImageUrl?: string;
  };
  userName?: string;
  displayName?: string;
  authorName?: string;
  authorHandle?: string;
  profileImageUrl?: string;
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
  media?: Array<{
    url?: string;
    type?: string;
    thumbnailUrl?: string;
    duration?: number;
  }>;
  photos?: Array<{ url?: string }>;
  videos?: Array<{ url?: string; thumbnailUrl?: string; duration?: number }>;
  retweet_count?: number;
  retweetCount?: number;
  favorite_count?: number;
  likeCount?: number;
  reply_count?: number;
  replyCount?: number;
}

/**
 * Twitter/X scraper using FxTwitter API (primary) with Apify fallback
 */
export class TwitterScraper implements ContentScraper {
  name = 'twitter';
  private client: ApifyClient | null = null;

  constructor(apiToken?: string) {
    // Apify is optional now - FxTwitter is our primary method
    const token = apiToken || process.env.APIFY_API_TOKEN;
    if (token) {
      this.client = new ApifyClient({ token });
    }
  }

  canHandle(url: string): boolean {
    return TWITTER_URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  async scrape(url: string, options?: ScraperOptions): Promise<ExtractedContent> {
    // Extract username and tweet ID from URL
    const match = url.match(/(?:twitter|x)\.com\/(\w+)\/status\/(\d+)/i);
    if (!match) {
      throw new Error('Invalid Twitter/X URL format');
    }

    const username = match[1] as string;
    const tweetId = match[2] as string;
    const errors: string[] = [];

    // Try FxTwitter API first (free, reliable)
    try {
      console.log(`Trying FxTwitter API for tweet ${tweetId}`);
      const result = await this.fetchFromFxTwitter(username, tweetId);
      if (result) {
        console.log('SUCCESS: FxTwitter API returned valid tweet data');
        return result;
      }
    } catch (err) {
      const errMsg = `FxTwitter failed: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(errMsg);
      errors.push(errMsg);
    }

    // Try VxTwitter API as backup
    try {
      console.log(`Trying VxTwitter API for tweet ${tweetId}`);
      const result = await this.fetchFromVxTwitter(username, tweetId);
      if (result) {
        console.log('SUCCESS: VxTwitter API returned valid tweet data');
        return result;
      }
    } catch (err) {
      const errMsg = `VxTwitter failed: ${err instanceof Error ? err.message : String(err)}`;
      console.warn(errMsg);
      errors.push(errMsg);
    }

    // Fallback to Apify if available
    if (this.client) {
      try {
        console.log('Trying Apify actors as fallback');
        const result = await this.fetchFromApify(url, tweetId, options?.timeout);
        if (result) {
          console.log('SUCCESS: Apify returned valid tweet data');
          return result;
        }
      } catch (err) {
        const errMsg = `Apify failed: ${err instanceof Error ? err.message : String(err)}`;
        console.warn(errMsg);
        errors.push(errMsg);
      }
    }

    throw new Error(`No tweet data returned. Errors: ${errors.join('; ')}`);
  }

  /**
   * Fetch parent tweets in a thread (walking up the chain)
   * Only follows replies from the same author to capture intentional threads
   */
  async fetchThreadParents(
    tweetId: string,
    authorHandle: string,
    maxDepth: number = 20
  ): Promise<ExtractedContent[]> {
    const thread: ExtractedContent[] = [];
    let currentId = tweetId;
    const normalizedAuthor = authorHandle.replace('@', '').toLowerCase();

    while (thread.length < maxDepth) {
      // Construct URL for the current tweet
      const url = `https://x.com/${normalizedAuthor}/status/${currentId}`;

      try {
        const tweet = await this.scrape(url);
        if (!tweet) break;

        // Check if this tweet is a reply by the same author
        const parentId = tweet.platformData?.replyingToStatus as string | undefined;
        const replyingTo = (tweet.platformData?.replyingTo as string | undefined)?.toLowerCase();

        // Add to the front of the array (building from newest to oldest)
        thread.unshift(tweet);

        // Stop if:
        // - No parent tweet (this is the thread root)
        // - Parent is by a different author (not a self-thread)
        if (!parentId || replyingTo !== normalizedAuthor) {
          break;
        }

        currentId = parentId;
      } catch (err) {
        console.warn(`Failed to fetch thread parent ${currentId}:`, err);
        break;
      }
    }

    return thread;
  }

  /**
   * Extract tweet ID from URL
   */
  static extractTweetId(url: string): string | null {
    const match = url.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/i);
    return match?.[1] ?? null;
  }

  /**
   * Fetch tweet from FxTwitter API (free, no auth required)
   */
  private async fetchFromFxTwitter(username: string, tweetId: string): Promise<ExtractedContent | null> {
    const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;

    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`FxTwitter API returned ${response.status}`);
    }

    const data = (await response.json()) as FxTwitterResponse;

    if (data.code !== 200 || !data.tweet) {
      throw new Error(data.message || 'Tweet not found');
    }

    const tweet = data.tweet;

    // Extract images
    const images: MediaItem[] = [];
    if (tweet.media?.photos) {
      for (const photo of tweet.media.photos) {
        images.push({ url: photo.url });
      }
    }

    // Extract videos
    const videos: VideoItem[] = [];
    if (tweet.media?.videos) {
      for (const video of tweet.media.videos) {
        videos.push({
          url: video.url,
          thumbnail: video.thumbnail_url,
          duration: video.duration,
        });
      }
    }

    // Parse date
    let publishedAt: string | undefined;
    if (tweet.created_at) {
      try {
        publishedAt = new Date(tweet.created_at).toISOString();
      } catch {
        // Invalid date
      }
    } else if (tweet.created_timestamp) {
      publishedAt = new Date(tweet.created_timestamp * 1000).toISOString();
    }

    // Build thread context if this is a reply
    const threadContext: ThreadContext = {
      parentTweetId: tweet.replying_to_status,
      parentAuthor: tweet.replying_to,
      isThreadContinuation: !!(tweet.replying_to_status && tweet.replying_to === tweet.author.screen_name),
    };

    return {
      title: tweet.text.slice(0, 100) + (tweet.text.length > 100 ? '...' : ''),
      description: tweet.text,
      bodyText: tweet.text,
      authorName: tweet.author.name,
      authorHandle: `@${tweet.author.screen_name}`,
      publishedAt,
      images,
      videos,
      platformData: {
        tweetId: tweet.id,
        retweetCount: tweet.retweets,
        likeCount: tweet.likes,
        replyCount: tweet.replies,
        viewCount: tweet.views,
        bookmarkCount: tweet.bookmarks,
        profileImageUrl: tweet.author.avatar_url,
        replyingTo: tweet.replying_to,
        replyingToStatus: tweet.replying_to_status,
      },
      threadContext,
    };
  }

  /**
   * Fetch tweet from VxTwitter API (free backup)
   */
  private async fetchFromVxTwitter(username: string, tweetId: string): Promise<ExtractedContent | null> {
    const apiUrl = `https://api.vxtwitter.com/${username}/status/${tweetId}`;

    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`VxTwitter API returned ${response.status}`);
    }

    const text = await response.text();

    // VxTwitter sometimes returns HTML instead of JSON
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      throw new Error('VxTwitter returned HTML instead of JSON');
    }

    const data = JSON.parse(text);

    if (!data.tweetID) {
      throw new Error('Tweet not found');
    }

    // Extract images
    const images: MediaItem[] = [];
    if (data.mediaURLs?.length > 0) {
      for (const url of data.mediaURLs) {
        // Only add images, not videos
        if (!url.includes('.mp4') && !url.includes('/video/')) {
          images.push({ url });
        }
      }
    }

    // Extract videos
    const videos: VideoItem[] = [];
    if (data.media_extended?.length > 0) {
      for (const media of data.media_extended) {
        if (media.type === 'video' && media.url) {
          videos.push({
            url: media.url,
            thumbnail: media.thumbnail_url,
            duration: media.duration_millis ? media.duration_millis / 1000 : undefined,
          });
        }
      }
    }

    // Parse date
    let publishedAt: string | undefined;
    if (data.date) {
      try {
        publishedAt = new Date(data.date).toISOString();
      } catch {
        // Invalid date
      }
    } else if (data.date_epoch) {
      publishedAt = new Date(data.date_epoch * 1000).toISOString();
    }

    return {
      title: data.text.slice(0, 100) + (data.text.length > 100 ? '...' : ''),
      description: data.text,
      bodyText: data.text,
      authorName: data.user_name,
      authorHandle: `@${data.user_screen_name}`,
      publishedAt,
      images,
      videos,
      platformData: {
        tweetId: data.tweetID,
        retweetCount: data.retweets,
        likeCount: data.likes,
        replyCount: data.replies,
        profileImageUrl: data.user_profile_image_url,
      },
    };
  }

  /**
   * Fallback to Apify actors
   */
  private async fetchFromApify(
    url: string,
    tweetId: string,
    timeout?: number
  ): Promise<ExtractedContent | null> {
    if (!this.client) {
      throw new Error('Apify client not configured');
    }

    const xUrl = url.replace('twitter.com', 'x.com');
    const timeoutSec = (timeout || 120000) / 1000;

    const actors = [
      {
        id: 'apidojo/tweet-scraper',
        input: { tweetIDs: [tweetId], maxItems: 1, addUserInfo: true },
      },
      {
        id: 'apidojo/twitter-scraper-lite',
        input: { tweetIDs: [tweetId], maxItems: 1 },
      },
      {
        id: 'xtdata/twitter-x-scraper',
        input: { tweetIds: [tweetId], maxItems: 1 },
      },
    ];

    for (const actor of actors) {
      try {
        console.log(`Trying Apify actor: ${actor.id}`);

        const run = await this.client.actor(actor.id).call(actor.input, {
          timeout: timeoutSec,
          waitSecs: 60,
        });

        const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

        if (items?.length > 0) {
          const tweet = items[0] as ApifyTweetResult;
          const result = this.parseApifyTweet(tweet, url);

          if (this.isValidTweetData(result)) {
            return result;
          }
        }
      } catch (err) {
        console.warn(`Actor ${actor.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return null;
  }

  private isValidTweetData(result: ExtractedContent): boolean {
    const text = result.bodyText || result.description || '';

    const invalidPatterns = [
      /KaitoEasyAPI/i,
      /Our API pricing is based on/i,
      /From .+, a reminder:/i,
      /mock_tweet/i,
      /This is a sample/i,
      /test tweet/i,
    ];

    for (const pattern of invalidPatterns) {
      if (pattern.test(text)) {
        return false;
      }
    }

    return text.length >= 5;
  }

  private parseApifyTweet(tweet: ApifyTweetResult, originalUrl?: string): ExtractedContent {
    const text = tweet.full_text || tweet.text || tweet.rawContent || tweet.content || '';

    const userName =
      tweet.user?.screen_name ||
      tweet.author?.userName ||
      tweet.userName ||
      tweet.authorHandle?.replace('@', '');
    const displayName =
      tweet.user?.name || tweet.author?.displayName || tweet.displayName || tweet.authorName;
    const profileImage =
      tweet.user?.profile_image_url_https ||
      tweet.author?.profileImageUrl ||
      tweet.profileImageUrl;

    const images: MediaItem[] = [];
    const mediaEntities = tweet.extended_entities?.media || tweet.entities?.media || [];
    for (const media of mediaEntities) {
      if (media.type === 'photo' && media.media_url_https) {
        images.push({ url: media.media_url_https });
      }
    }

    if (tweet.media) {
      for (const media of tweet.media) {
        if (media.type === 'photo' && media.url && !images.some((i) => i.url === media.url)) {
          images.push({ url: media.url });
        }
      }
    }

    if (tweet.photos) {
      for (const photo of tweet.photos) {
        if (photo.url && !images.some((i) => i.url === photo.url)) {
          images.push({ url: photo.url });
        }
      }
    }

    const videos: VideoItem[] = [];
    for (const media of mediaEntities) {
      if ((media.type === 'video' || media.type === 'animated_gif') && media.video_info) {
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

    if (tweet.media) {
      for (const media of tweet.media) {
        if (media.type === 'video' && media.url && !videos.some((v) => v.url === media.url)) {
          videos.push({
            url: media.url,
            thumbnail: media.thumbnailUrl,
            duration: media.duration,
          });
        }
      }
    }

    if (tweet.videos) {
      for (const video of tweet.videos) {
        if (video.url && !videos.some((v) => v.url === video.url)) {
          videos.push({
            url: video.url,
            thumbnail: video.thumbnailUrl,
            duration: video.duration,
          });
        }
      }
    }

    let publishedAt: string | undefined;
    const dateStr = tweet.created_at || tweet.createdAt || tweet.date;
    if (dateStr) {
      try {
        publishedAt = new Date(dateStr).toISOString();
      } catch {
        // Invalid date
      }
    }

    const tweetId = tweet.id || tweet.id_str || tweet.tweetId || tweet.rest_id;
    const retweetCount = tweet.retweet_count ?? tweet.retweetCount;
    const likeCount = tweet.favorite_count ?? tweet.likeCount;
    const replyCount = tweet.reply_count ?? tweet.replyCount;

    return {
      title: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
      description: text,
      bodyText: text,
      authorName: displayName,
      authorHandle: userName ? `@${userName}` : undefined,
      publishedAt,
      images,
      videos,
      platformData: {
        tweetId,
        retweetCount,
        likeCount,
        replyCount,
        profileImageUrl: profileImage,
      },
    };
  }
}
