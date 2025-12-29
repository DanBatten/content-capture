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
  const { data: tweets } = await supabase
    .from('content_items')
    .select('id, title, source_url, platform_data')
    .eq('source_type', 'twitter');

  // Find tweets with multiple links
  const withMultipleLinks = tweets?.filter(t => {
    const links = (t.platform_data?.linked_content as any[]) || [];
    return links.filter(l => !l.error).length >= 2;
  }).sort((a, b) => {
    const aLinks = ((a.platform_data?.linked_content as any[]) || []).length;
    const bLinks = ((b.platform_data?.linked_content as any[]) || []).length;
    return bLinks - aLinks;
  });

  console.log('='.repeat(60));
  console.log('TWEETS WITH MULTIPLE LINKS');
  console.log('='.repeat(60));

  for (const tweet of withMultipleLinks?.slice(0, 5) || []) {
    const links = (tweet.platform_data?.linked_content as any[]) || [];
    const thread = tweet.platform_data?.thread as any;
    console.log('\nTitle:', tweet.title?.slice(0, 60));
    console.log('URL:', tweet.source_url);
    console.log('Thread tweets:', thread?.tweetCount || 1);
    console.log('Links:', links.length);
    links.forEach((l, i) => {
      console.log(`  ${i + 1}. [${l.contentType || 'article'}] ${l.title?.slice(0, 40) || l.url?.slice(0, 50)}`);
    });
  }

  // Find tweets with arxiv + other links
  const withArxivAndMore = tweets?.filter(t => {
    const links = (t.platform_data?.linked_content as any[]) || [];
    const hasArxiv = links.some(l => l.url?.includes('arxiv'));
    return hasArxiv && links.filter(l => !l.error).length > 1;
  });

  console.log('\n' + '='.repeat(60));
  console.log('TWEETS WITH ARXIV + OTHER LINKS');
  console.log('='.repeat(60));

  for (const tweet of withArxivAndMore?.slice(0, 3) || []) {
    const links = (tweet.platform_data?.linked_content as any[]) || [];
    const thread = tweet.platform_data?.thread as any;
    console.log('\nTitle:', tweet.title?.slice(0, 60));
    console.log('URL:', tweet.source_url);
    console.log('Thread tweets:', thread?.tweetCount || 1);
    console.log('Links:');
    links.forEach((l, i) => {
      const isPdf = l.contentType === 'pdf' || l.contentType === 'arxiv';
      console.log(`  ${i + 1}. [${isPdf ? 'PDF' : 'article'}] ${l.title?.slice(0, 40) || l.url?.slice(0, 50)}`);
    });
  }
}

main().catch(console.error);
