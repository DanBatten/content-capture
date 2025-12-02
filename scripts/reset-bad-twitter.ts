/**
 * Reset Twitter items with promotional mock data back to failed status
 */

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
  // Find items with promotional data
  const { data: badItems, error: findError } = await supabase
    .from('content_items')
    .select('id')
    .eq('status', 'complete')
    .ilike('title', '%KaitoEasyAPI%');

  if (findError) {
    console.error('Error finding items:', findError);
    return;
  }

  if (!badItems || badItems.length === 0) {
    console.log('No items with promotional data found');
    return;
  }

  console.log(`Found ${badItems.length} items with promotional mock data`);
  console.log('Resetting them to failed status...');

  const ids = badItems.map(item => item.id);

  const { error: updateError } = await supabase
    .from('content_items')
    .update({
      status: 'failed',
      error_message: 'Scraped data was promotional mock content, not actual tweet',
      title: null,
      description: null,
      body_text: null,
      summary: null,
      topics: null,
      disciplines: null,
      use_cases: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (updateError) {
    console.error('Error updating items:', updateError);
    return;
  }

  console.log(`✓ Reset ${badItems.length} items to failed status`);
  console.log('These can be retried when Twitter scrapers are working properly');
}

main().catch(console.error);
