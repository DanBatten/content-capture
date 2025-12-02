/**
 * Test the updated Twitter scraper with FxTwitter
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TwitterScraper } from '@content-capture/scrapers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

// Test with different tweet URLs
const testUrls = [
  // Recent tweet we know exists
  'https://x.com/simonw/status/1944260043001737216',
  // Older tweet
  'https://twitter.com/elikiamo/status/1930649456389816371',
  // Another format
  'https://x.com/NotionHQ/status/1968744673347830152',
];

async function main() {
  console.log('Testing Twitter scraper with FxTwitter API...\n');

  const scraper = new TwitterScraper();

  for (const url of testUrls) {
    console.log('='.repeat(60));
    console.log(`Testing: ${url}`);
    console.log('='.repeat(60));

    try {
      const result = await scraper.scrape(url);

      console.log('\nSUCCESS!');
      console.log(`Title: ${result.title}`);
      console.log(`Author: ${result.authorName} (${result.authorHandle})`);
      console.log(`Published: ${result.publishedAt}`);
      console.log(`Text: ${result.bodyText?.substring(0, 100)}...`);
      console.log(`Images: ${result.images?.length || 0}`);
      console.log(`Videos: ${result.videos?.length || 0}`);
      console.log(`Platform data:`, result.platformData);
      console.log();
    } catch (err) {
      console.log(`\nFAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  console.log('Done!');
}

main().catch(console.error);
