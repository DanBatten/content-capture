/**
 * Thread Fetcher Utility
 *
 * Fetches full Twitter thread data using multiple approaches:
 * 1. ThreadReaderApp (for threads that have been unrolled)
 * 2. FxTwitter API (walking up the reply chain)
 */

import * as cheerio from 'cheerio';
import { extractLinksFromText } from './link-extractor';

export interface ThreadData {
  tweetCount: number;
  texts: string[];
  links: string[];
  fullText: string;
  source: 'threadreader' | 'fxtwitter' | 'none';
}

interface FxTweet {
  id: string;
  text: string;
  author: { screen_name: string };
  replying_to?: string;
  replying_to_status?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch thread from ThreadReaderApp (only works for unrolled threads)
 */
async function fetchFromThreadReader(tweetId: string): Promise<ThreadData | null> {
  const url = `https://threadreaderapp.com/thread/${tweetId}.html`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Check if this is actually an unrolled thread
    const contentTweets = $('.content-tweet');
    if (contentTweets.length === 0) {
      return null;
    }

    const texts: string[] = [];
    const allLinks: string[] = [];

    contentTweets.each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 5) {
        texts.push(text);
        const links = extractLinksFromText(text);
        allLinks.push(...links);
      }
    });

    // Also extract links from anchor tags within tweets
    contentTweets.find('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.startsWith('http')) {
        const extracted = extractLinksFromText(href);
        allLinks.push(...extracted);
      }
    });

    const uniqueLinks = [...new Set(allLinks)];

    return {
      tweetCount: texts.length,
      texts,
      links: uniqueLinks,
      fullText: texts.join('\n\n---\n\n'),
      source: 'threadreader',
    };
  } catch {
    return null;
  }
}

interface FxTwitterResponse {
  code: number;
  tweet?: {
    id: string;
    text: string;
    author: { screen_name: string };
    replying_to?: string;
    replying_to_status?: string;
  };
}

/**
 * Fetch single tweet from FxTwitter API
 */
async function fetchTweetFromFx(handle: string, tweetId: string): Promise<FxTweet | null> {
  try {
    const url = `https://api.fxtwitter.com/${handle}/status/${tweetId}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as FxTwitterResponse;
    if (data.code !== 200 || !data.tweet) return null;

    return {
      id: data.tweet.id,
      text: data.tweet.text,
      author: data.tweet.author,
      replying_to: data.tweet.replying_to,
      replying_to_status: data.tweet.replying_to_status,
    };
  } catch {
    return null;
  }
}

/**
 * Walk up the thread reply chain using FxTwitter
 */
async function walkThreadUp(
  handle: string,
  tweetId: string,
  authorHandle: string,
  maxDepth = 10
): Promise<FxTweet[]> {
  const thread: FxTweet[] = [];
  let currentId = tweetId;
  let currentHandle = handle;
  let depth = 0;

  while (depth < maxDepth) {
    const tweet = await fetchTweetFromFx(currentHandle, currentId);
    if (!tweet) break;

    // Only include tweets from the same author (thread continuation)
    if (tweet.author.screen_name.toLowerCase() === authorHandle.toLowerCase()) {
      thread.unshift(tweet); // Add to beginning
    }

    // Check if this is a reply to another tweet by same author
    if (
      tweet.replying_to_status &&
      tweet.replying_to?.toLowerCase() === authorHandle.toLowerCase()
    ) {
      currentId = tweet.replying_to_status;
      currentHandle = tweet.replying_to;
      depth++;
      await sleep(300);
    } else {
      break;
    }
  }

  return thread;
}

/**
 * Fetch thread data using multiple approaches
 *
 * @param tweetId - The tweet ID to fetch thread for
 * @param authorHandle - The author's handle (with or without @)
 * @returns ThreadData or null if no thread found
 */
export async function fetchThreadData(
  tweetId: string,
  authorHandle: string
): Promise<ThreadData | null> {
  // First try ThreadReaderApp (best for fully unrolled threads)
  const threadReaderData = await fetchFromThreadReader(tweetId);
  if (threadReaderData && threadReaderData.tweetCount > 1) {
    return threadReaderData;
  }

  // Fall back to walking up the reply chain via FxTwitter
  const cleanHandle = authorHandle.replace('@', '');
  const fxThread = await walkThreadUp(cleanHandle, tweetId, cleanHandle);

  if (fxThread.length > 1) {
    const texts = fxThread.map(t => t.text);
    const allLinks: string[] = [];
    for (const t of fxThread) {
      allLinks.push(...extractLinksFromText(t.text));
    }

    return {
      tweetCount: fxThread.length,
      texts,
      links: [...new Set(allLinks)],
      fullText: texts.join('\n\n---\n\n'),
      source: 'fxtwitter',
    };
  }

  // If we got ThreadReaderApp data with just 1 tweet, return it for any links
  if (threadReaderData) {
    return threadReaderData;
  }

  return null;
}

/**
 * Extract tweet ID from a Twitter/X URL
 */
export function extractTweetId(url: string): string | null {
  const match = url.match(/status\/(\d+)/);
  return match?.[1] || null;
}
