/**
 * Check Processing Status
 *
 * Shows current status of all content items.
 *
 * Usage:
 *   npm run status
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
  // Get counts by status
  const { data: items, error } = await supabase
    .from('content_items')
    .select('status, source_type, error_message');

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Count by status
  const byStatus: Record<string, number> = {};
  const byType: Record<string, Record<string, number>> = {};
  const errorCounts: Record<string, number> = {};

  items.forEach(item => {
    // By status
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;

    // By type and status
    if (!byType[item.source_type]) {
      byType[item.source_type] = {};
    }
    byType[item.source_type][item.status] = (byType[item.source_type][item.status] || 0) + 1;

    // Error messages
    if (item.status === 'failed' && item.error_message) {
      const shortError = item.error_message.substring(0, 60);
      errorCounts[shortError] = (errorCounts[shortError] || 0) + 1;
    }
  });

  console.log('='.repeat(50));
  console.log('Content Capture Status');
  console.log('='.repeat(50));
  console.log('');

  console.log('Overall Status:');
  console.log('-'.repeat(30));
  const statusOrder = ['complete', 'processing', 'pending', 'failed'];
  statusOrder.forEach(status => {
    if (byStatus[status]) {
      const pct = ((byStatus[status] / items.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(byStatus[status] / items.length * 20));
      console.log(`  ${status.padEnd(12)} ${String(byStatus[status]).padStart(4)}  ${bar} ${pct}%`);
    }
  });
  console.log(`  ${'Total'.padEnd(12)} ${items.length}`);
  console.log('');

  console.log('By Source Type:');
  console.log('-'.repeat(30));
  Object.keys(byType).sort().forEach(type => {
    const statuses = byType[type];
    const total = Object.values(statuses).reduce((a, b) => a + b, 0);
    const complete = statuses['complete'] || 0;
    const failed = statuses['failed'] || 0;
    console.log(`  ${type.padEnd(12)} ${String(total).padStart(4)} total | ${complete} done | ${failed} failed`);
  });
  console.log('');

  if (Object.keys(errorCounts).length > 0) {
    console.log('Top Errors:');
    console.log('-'.repeat(30));
    Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([msg, count]) => {
        console.log(`  [${count}x] ${msg}`);
      });
    console.log('');
  }

  // Get recent completions
  const { data: recent } = await supabase
    .from('content_items')
    .select('title, source_type, processed_at')
    .eq('status', 'complete')
    .order('processed_at', { ascending: false })
    .limit(5);

  if (recent && recent.length > 0) {
    console.log('Recent Completions:');
    console.log('-'.repeat(30));
    recent.forEach(item => {
      const title = item.title ? item.title.substring(0, 40) : 'Untitled';
      console.log(`  [${item.source_type}] ${title}`);
    });
  }
}

main().catch(console.error);
