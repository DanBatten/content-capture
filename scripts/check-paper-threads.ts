import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get tweets mentioning papers but NOT having arxiv in linked content
  const { data: tweets } = await supabase
    .from('content_items')
    .select('id, title, body_text, source_url, platform_data, author_handle')
    .eq('source_type', 'twitter')
    .or('body_text.ilike.%paper%,body_text.ilike.%research%,title.ilike.%paper%');

  console.log('Tweets mentioning papers/research:', tweets?.length || 0);
  console.log('');

  // Categorize
  const hasArxivLink: typeof tweets = [];
  const hasThreadNoArxiv: typeof tweets = [];
  const noThreadNoArxiv: typeof tweets = [];

  for (const tweet of tweets || []) {
    const linkedContent = (tweet.platform_data?.linked_content as Array<{url: string}>) || [];
    const hasArxiv = linkedContent.some(l => l.url?.includes('arxiv'));
    const hasThread = tweet.platform_data?.thread && (tweet.platform_data?.threadLength as number) > 1;

    if (hasArxiv) {
      hasArxivLink.push(tweet);
    } else if (hasThread) {
      hasThreadNoArxiv.push(tweet);
    } else {
      noThreadNoArxiv.push(tweet);
    }
  }

  console.log('='.repeat(60));
  console.log('CATEGORIZATION');
  console.log('='.repeat(60));
  console.log('Already have arxiv links:', hasArxivLink.length);
  console.log('Have thread data but no arxiv:', hasThreadNoArxiv.length);
  console.log('No thread data, no arxiv:', noThreadNoArxiv.length);
  console.log('');

  // Show tweets that need thread fetching
  console.log('='.repeat(60));
  console.log('TWEETS THAT NEED THREAD FETCHING (no arxiv, no thread data)');
  console.log('='.repeat(60));

  for (const tweet of noThreadNoArxiv.slice(0, 15)) {
    console.log('');
    console.log('Author:', tweet.author_handle);
    console.log('URL:', tweet.source_url);
    console.log('Preview:', tweet.body_text?.slice(0, 120) + '...');
  }

  // Extract tweet IDs for potential thread fetching
  console.log('');
  console.log('='.repeat(60));
  console.log('TWEET IDs TO FETCH THREADS FOR:');
  console.log('='.repeat(60));

  const tweetIds = noThreadNoArxiv.map(t => {
    const match = t.source_url?.match(/status\/(\d+)/);
    return {
      id: match?.[1],
      handle: t.author_handle?.replace('@', ''),
      url: t.source_url,
    };
  }).filter(t => t.id && t.handle);

  console.log(JSON.stringify(tweetIds.slice(0, 10), null, 2));
}

main().catch(console.error);
