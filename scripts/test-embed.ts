/**
 * Test Twitter embed API directly
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

// Test URL - a specific tweet (more recent, should exist)
// This is from the quacker result: @simonw tweet from Jul 13, 2025
const testUrl = 'https://x.com/simonw/status/1944260043001737216';
const testTweetId = '1944260043001737216';

async function testEmbed() {
  console.log('Testing Twitter/X embed APIs directly...\n');

  // Test 1: oEmbed API (public, no auth required)
  console.log('='.repeat(60));
  console.log('Test 1: Twitter oEmbed API');
  console.log('='.repeat(60));

  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(testUrl)}`;
    console.log(`URL: ${oembedUrl}`);

    const response = await fetch(oembedUrl);
    console.log(`Status: ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      console.log('Success! Response:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log(`Error: ${text}`);
    }
  } catch (err) {
    console.log(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Test 2: Syndication API (used by embed widgets)
  console.log('\n' + '='.repeat(60));
  console.log('Test 2: Twitter Syndication API');
  console.log('='.repeat(60));

  try {
    const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${testTweetId}&lang=en`;
    console.log(`URL: ${syndicationUrl}`);

    const response = await fetch(syndicationUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    console.log(`Status: ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      console.log('Success! Response:');
      console.log(JSON.stringify(data, null, 2).substring(0, 2000));
    } else {
      const text = await response.text();
      console.log(`Error: ${text.substring(0, 500)}`);
    }
  } catch (err) {
    console.log(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Test 3: FxTwitter/FixTweet API (open source alternative)
  console.log('\n' + '='.repeat(60));
  console.log('Test 3: FxTwitter API');
  console.log('='.repeat(60));

  try {
    const fxUrl = `https://api.fxtwitter.com/simonw/status/${testTweetId}`;
    console.log(`URL: ${fxUrl}`);

    const response = await fetch(fxUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });
    console.log(`Status: ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      console.log('Success! Response:');
      console.log(JSON.stringify(data, null, 2).substring(0, 2000));
    } else {
      const text = await response.text();
      console.log(`Error: ${text.substring(0, 500)}`);
    }
  } catch (err) {
    console.log(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Test 4: VxTwitter API (another alternative)
  console.log('\n' + '='.repeat(60));
  console.log('Test 4: VxTwitter API');
  console.log('='.repeat(60));

  try {
    const vxUrl = `https://api.vxtwitter.com/simonw/status/${testTweetId}`;
    console.log(`URL: ${vxUrl}`);

    const response = await fetch(vxUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });
    console.log(`Status: ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      console.log('Success! Response:');
      console.log(JSON.stringify(data, null, 2).substring(0, 2000));
    } else {
      const text = await response.text();
      console.log(`Error: ${text.substring(0, 500)}`);
    }
  } catch (err) {
    console.log(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('\n\nDone!');
}

testEmbed().catch(console.error);
