/**
 * Test different approaches for getting thread replies
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

// Test tweet - one that we know has thread replies
const TEST_HANDLE = '_avichawla';
const TEST_TWEET_ID = '1993937830968742393';

async function testFxTwitter() {
  console.log('\n=== Testing FxTwitter API ===');
  const url = `https://api.fxtwitter.com/${TEST_HANDLE}/status/${TEST_TWEET_ID}`;
  console.log('URL:', url);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json();

    console.log('Response code:', data.code);
    console.log('Tweet text preview:', data.tweet?.text?.slice(0, 100));
    console.log('Replying to:', data.tweet?.replying_to);
    console.log('Replying to status:', data.tweet?.replying_to_status);

    // Check if there's any thread/conversation data
    console.log('Has thread field:', 'thread' in (data.tweet || {}));
    console.log('Has conversation field:', 'conversation' in (data.tweet || {}));
    console.log('Has replies field:', 'replies' in (data.tweet || {}));

    // Log all keys to see what's available
    console.log('Available keys:', Object.keys(data.tweet || {}));
  } catch (err) {
    console.error('Error:', err);
  }
}

async function testVxTwitter() {
  console.log('\n=== Testing VxTwitter API ===');
  const url = `https://api.vxtwitter.com/${TEST_HANDLE}/status/${TEST_TWEET_ID}`;
  console.log('URL:', url);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json();

    console.log('Response:', JSON.stringify(data, null, 2).slice(0, 500));
  } catch (err) {
    console.error('Error:', err);
  }
}

async function testNitter() {
  console.log('\n=== Testing Nitter Scraping ===');
  // Try multiple Nitter instances
  const nitterInstances = [
    'nitter.poast.org',
    'nitter.privacydev.net',
    'nitter.woodland.cafe',
  ];

  for (const instance of nitterInstances) {
    const url = `https://${instance}/${TEST_HANDLE}/status/${TEST_TWEET_ID}`;
    console.log('Trying:', url);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.log('  Status:', response.status);
        continue;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Look for thread replies
      const mainTweet = $('.main-tweet');
      const replies = $('.reply-thread, .thread-line, .timeline-item');

      console.log('  Main tweet found:', mainTweet.length > 0);
      console.log('  Replies/thread items found:', replies.length);

      // Try to extract reply texts
      const replyTexts = $('.tweet-content')
        .map((_, el) => $(el).text().trim().slice(0, 80))
        .get();
      console.log('  Tweet contents found:', replyTexts.length);
      if (replyTexts.length > 1) {
        console.log('  First few:', replyTexts.slice(0, 3));
        return { instance, success: true };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log('  Error:', message.slice(0, 50));
    }
  }

  return { success: false };
}

async function testTwitterSyndication() {
  console.log('\n=== Testing Twitter Syndication API ===');

  // Try the tweet embed endpoint
  const embedUrl = `https://publish.twitter.com/oembed?url=https://twitter.com/${TEST_HANDLE}/status/${TEST_TWEET_ID}`;
  console.log('oEmbed URL:', embedUrl);

  try {
    const response = await fetch(embedUrl);
    const data = await response.json();
    console.log('oEmbed response:', JSON.stringify(data, null, 2).slice(0, 300));
  } catch (err) {
    console.error('Error:', err);
  }
}

async function testThreadReaderApp() {
  console.log('\n=== Testing ThreadReaderApp ===');
  const url = `https://threadreaderapp.com/thread/${TEST_TWEET_ID}.html`;
  console.log('URL:', url);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    console.log('Status:', response.status);

    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);

      // Look for thread content
      const tweets = $('.tweet-content, .content-tweet, .thread-content');
      console.log('Thread tweets found:', tweets.length);

      const texts = tweets
        .map((_, el) => $(el).text().trim().slice(0, 80))
        .get();
      console.log('Texts:', texts.slice(0, 3));
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error:', message);
  }
}

async function main() {
  console.log('Testing thread fetching approaches');
  console.log('Test tweet:', `https://x.com/${TEST_HANDLE}/status/${TEST_TWEET_ID}`);

  await testFxTwitter();
  await testVxTwitter();
  await testNitter();
  await testTwitterSyndication();
  await testThreadReaderApp();

  console.log('\n=== Summary ===');
  console.log('Check above results to see which approach works for getting thread replies');
}

main().catch(console.error);
