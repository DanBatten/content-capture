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
  // Count tweets with and without thread data
  const { data: all } = await supabase
    .from('content_items')
    .select('id, platform_data, source_url')
    .eq('source_type', 'twitter')
    .eq('status', 'complete');

  let hasThread = 0;
  let noThread = 0;
  let hasLinkedContent = 0;
  let hasEnrichedAt = 0;

  all?.forEach(item => {
    const pd = item.platform_data as Record<string, unknown>;
    if (pd?.thread) hasThread++;
    else noThread++;
    if (pd?.linked_content) hasLinkedContent++;
    if (pd?.enriched_at) hasEnrichedAt++;
  });

  console.log('Twitter posts enrichment status:');
  console.log('================================');
  console.log('  With thread data:', hasThread);
  console.log('  Without thread data:', noThread);
  console.log('  With linked_content:', hasLinkedContent);
  console.log('  Already enriched:', hasEnrichedAt);
  console.log('  Total:', all?.length);
  console.log('');
  console.log('Items needing enrichment:', (all?.length || 0) - hasEnrichedAt);
}

main();
