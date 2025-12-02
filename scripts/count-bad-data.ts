import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function main() {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, title, source_type')
    .eq('status', 'complete')
    .ilike('title', '%KaitoEasyAPI%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Items with promotional data:', data?.length || 0);

  if (data && data.length > 0) {
    console.log('\nFirst 5 items:');
    data.slice(0, 5).forEach(item => {
      console.log(`  [${item.source_type}] ${item.title?.substring(0, 60)}...`);
    });
  }
}

main().catch(console.error);
