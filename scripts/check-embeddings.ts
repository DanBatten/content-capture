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
  // Check X Articles
  const { data: articles } = await supabase
    .from('content_items')
    .select('title, source_url, body_text, embedding, platform_data')
    .eq('source_type', 'twitter')
    .eq('status', 'complete')
    .not('body_text', 'is', null)
    .gt('body_text', '');

  console.log('Twitter items with body_text:\n');

  let needsEmbedding = 0;

  articles?.forEach(item => {
    const isArticle = (item.platform_data as Record<string, unknown>)?.isArticle;
    const hasEmbedding = item.embedding && (item.embedding as number[]).length > 0;
    const bodyLen = item.body_text?.length || 0;

    console.log(`${isArticle ? '[ARTICLE]' : '[TWEET]'} ${(item.title || 'Untitled').slice(0, 45)}...`);
    console.log(`  Body: ${bodyLen} chars | Embedding: ${hasEmbedding ? '✓' : '✗ MISSING'}`);

    if (!hasEmbedding) needsEmbedding++;
  });

  console.log(`\n${needsEmbedding} items need embeddings`);
}

main();
