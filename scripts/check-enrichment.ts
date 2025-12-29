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
  // Get stats on enriched tweets
  const { data: tweets } = await supabase
    .from('content_items')
    .select('id, title, platform_data')
    .eq('source_type', 'twitter');

  const withThread = tweets?.filter(t => t.platform_data?.thread?.tweetCount > 1) || [];
  const withLinks = tweets?.filter(t => (t.platform_data?.linked_content as any[])?.length > 0) || [];
  const withArxiv = tweets?.filter(t =>
    (t.platform_data?.linked_content as any[])?.some(l => l.url?.includes('arxiv'))
  ) || [];

  console.log('='.repeat(60));
  console.log('ENRICHMENT SUMMARY');
  console.log('='.repeat(60));
  console.log('Total tweets:', tweets?.length);
  console.log('Tweets with multi-tweet threads:', withThread.length);
  console.log('Tweets with linked content:', withLinks.length);
  console.log('Tweets with arxiv papers:', withArxiv.length);

  // Show sample thread
  console.log('\n--- Sample enriched tweet with arxiv ---');
  const sample = withArxiv[0];
  if (sample) {
    console.log('Title:', sample.title?.slice(0, 80));
    console.log('Thread tweets:', sample.platform_data?.thread?.tweetCount);
    console.log('Thread source:', sample.platform_data?.thread?.source);
    const links = (sample.platform_data?.linked_content as any[]) || [];
    console.log('Linked content count:', links.length);
    const arxivLink = links.find(l => l.url?.includes('arxiv'));
    if (arxivLink) {
      console.log('Arxiv URL:', arxivLink.url);
      console.log('Arxiv title:', arxivLink.title?.slice(0, 60));
      console.log('Arxiv body length:', arxivLink.bodyText?.length || 0, 'chars');
    }
  }

  // Count total linked content chars
  let totalLinkedChars = 0;
  for (const tweet of tweets || []) {
    const links = (tweet.platform_data?.linked_content as any[]) || [];
    for (const link of links) {
      totalLinkedChars += link.bodyText?.length || 0;
    }
  }
  console.log('\nTotal linked content scraped:', Math.round(totalLinkedChars / 1000), 'KB');
}

main().catch(console.error);
