/**
 * Test quacker and other actors that might work
 */

import { ApifyClient } from 'apify-client';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

// Test URL - a specific tweet
const testUrl = 'https://x.com/simonw/status/1866526154101084494';
const testTweetId = '1866526154101084494';

async function testActor(actorId: string, input: object, timeoutSec: number = 180) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${actorId}`);
  console.log(`Input: ${JSON.stringify(input, null, 2)}`);
  console.log('='.repeat(60));

  try {
    const run = await client.actor(actorId).call(input, {
      timeout: timeoutSec,
      waitSecs: timeoutSec,
    });

    console.log(`Run ID: ${run.id}`);
    console.log(`Status: ${run.status}`);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`Items returned: ${items.length}`);

    if (items.length > 0) {
      const first = items[0] as Record<string, unknown>;
      console.log('\nFirst item keys:', Object.keys(first));

      const tweetId = first.id_str || first.id || first.rest_id || first.tweetId;
      const isCorrectTweet = String(tweetId) === testTweetId;

      const text = first.full_text || first.text || first.rawContent || first.content || '';
      const textPreview = String(text).substring(0, 150);
      const hasValidText = textPreview.length > 10 && !textPreview.includes('undefined');

      console.log(`\nTweet ID: ${tweetId}`);
      console.log(`Correct tweet: ${isCorrectTweet ? '✅' : '❌'}`);
      console.log(`Has valid text: ${hasValidText ? '✅' : '❌'}`);
      console.log(`Text: "${textPreview}..."`);

      // Show full data for debugging
      console.log('\nFull first item:');
      console.log(JSON.stringify(first, null, 2).substring(0, 3000));

      return { works: true, correctTweet: isCorrectTweet, hasValidText };
    } else {
      console.log('❌ No items returned!');
      return { works: false, correctTweet: false, hasValidText: false };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('rent a paid Actor') || errMsg.includes('free trial')) {
      console.log(`❌ Requires paid subscription`);
    } else {
      console.log(`❌ Error: ${errMsg}`);
    }
    return { works: false, correctTweet: false, hasValidText: false };
  }
}

async function main() {
  console.log('Testing quacker and additional actors...\n');

  // quacker/twitter-scraper - main Apify Twitter scraper from search results
  await testActor('quacker/twitter-scraper', {
    startUrls: [{ url: testUrl }],
    maxTweets: 1,
    includeReplies: false,
    includeRetweets: false,
  });

  // Try with different input
  await testActor('quacker/twitter-scraper', {
    tweetUrls: [testUrl],
    maxTweets: 1,
  });

  // Try with handle input (to scrape profile)
  await testActor('quacker/twitter-scraper', {
    handle: ['simonw'],
    maxTweets: 1,
  });

  // Try hk1yh0u/twitter-scraper (different variant)
  await testActor('hk1yh0u/twitter-scraper', {
    startUrls: [{ url: testUrl }],
    maxItems: 1,
  });

  // Try quickscraper/twitter-scraper
  await testActor('quickscraper/twitter-scraper', {
    urls: [testUrl],
    maxItems: 1,
  });

  console.log('\n\nDone!');
}

main().catch(console.error);
