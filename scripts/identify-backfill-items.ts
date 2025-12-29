/**
 * Identify items created by backfill script
 */

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
  // Find all content_items that are targets in content_links
  // These are the ones created by the backfill script
  const { data: links, error: linksError } = await supabase
    .from('content_links')
    .select('target_content_id, url, source_content_id');

  if (linksError) {
    console.error('Error fetching links:', linksError);
    return;
  }

  console.log('Total content_links records:', links.length);

  // Get unique target IDs (these are items created by backfill)
  const targetIds = [...new Set(links.map(l => l.target_content_id).filter(Boolean))] as string[];
  console.log('Unique target_content_ids (items created by backfill):', targetIds.length);

  // Fetch these items
  const { data: backfillItems, error: itemsError } = await supabase
    .from('content_items')
    .select('id, source_url, title, status, created_at')
    .in('id', targetIds);

  if (itemsError) {
    console.error('Error fetching items:', itemsError);
    return;
  }

  console.log('\nItems created by backfill script:');
  console.log('Total:', backfillItems?.length || 0);

  // Count by status
  const byStatus: Record<string, number> = {};
  backfillItems?.forEach(i => {
    byStatus[i.status] = (byStatus[i.status] || 0) + 1;
  });
  console.log('By status:', byStatus);

  // Show sample
  console.log('\nSample of items to delete:');
  backfillItems?.slice(0, 15).forEach(i => {
    console.log('  -', i.id.slice(0,8), i.status, i.title?.slice(0,50) || i.source_url?.slice(0,50));
  });

  // Also check - are there any web items NOT in the links table?
  // These would be web items saved independently (should keep these)
  const { data: allWebItems } = await supabase
    .from('content_items')
    .select('id')
    .eq('source_type', 'web');

  const webItemIds = new Set(allWebItems?.map(i => i.id) || []);
  const backfillIds = new Set(targetIds);

  const independentWebItems = [...webItemIds].filter(id => !backfillIds.has(id));
  console.log('\nWeb items NOT from backfill (to keep):', independentWebItems.length);

  // Show these
  if (independentWebItems.length > 0) {
    const { data: keepItems } = await supabase
      .from('content_items')
      .select('id, title, source_url')
      .in('id', independentWebItems.slice(0, 5));
    console.log('Sample items to keep:');
    keepItems?.forEach(i => console.log('  -', i.title?.slice(0,50) || i.source_url?.slice(0,50)));
  }

  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY:');
  console.log('  Items to DELETE (from backfill):', targetIds.length);
  console.log('  Web items to KEEP:', independentWebItems.length);
  console.log('='.repeat(50));
}

main().catch(console.error);
