/**
 * Backfill PDF URLs for existing papers
 *
 * For papers where we have the content but didn't store the pdfUrl,
 * this script adds it to platform_data for future multimodal processing.
 *
 * Usage: npx tsx scripts/backfill-pdf-urls.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ContentItem {
  id: string;
  source_url: string;
  platform_data: Record<string, unknown> | null;
}

function getPdfUrl(sourceUrl: string): string | null {
  // Direct PDF URL
  if (sourceUrl.toLowerCase().endsWith('.pdf')) {
    return sourceUrl;
  }

  // ArXiv abstract page -> PDF
  if (/arxiv\.org\/abs\//.test(sourceUrl)) {
    return sourceUrl.replace('/abs/', '/pdf/') + '.pdf';
  }

  // ArXiv PDF page (already a PDF URL)
  if (/arxiv\.org\/pdf\//.test(sourceUrl)) {
    return sourceUrl.endsWith('.pdf') ? sourceUrl : sourceUrl + '.pdf';
  }

  return null;
}

async function backfillPdfUrls() {
  console.log('Backfilling PDF URLs...\n');

  // Get all items that might be PDFs but don't have pdfUrl set
  const { data: items, error } = await supabase
    .from('content_items')
    .select('id, source_url, platform_data')
    .or('source_url.ilike.%.pdf%,source_url.ilike.%arxiv.org%')
    .eq('status', 'complete');

  if (error) {
    console.error('Failed to fetch items:', error);
    return;
  }

  console.log(`Found ${items?.length || 0} potential PDF items\n`);

  let updated = 0;
  let skipped = 0;

  for (const item of (items || []) as ContentItem[]) {
    const existingPdfUrl = item.platform_data?.pdfUrl;

    if (existingPdfUrl) {
      skipped++;
      continue;
    }

    const pdfUrl = getPdfUrl(item.source_url);

    if (!pdfUrl) {
      skipped++;
      continue;
    }

    // Update the item with pdfUrl
    const { error: updateError } = await supabase
      .from('content_items')
      .update({
        platform_data: {
          ...(item.platform_data || {}),
          pdfUrl,
          contentFormat: 'pdf',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    if (updateError) {
      console.error(`Failed to update ${item.id}:`, updateError.message);
    } else {
      console.log(`Updated: ${item.source_url.slice(0, 60)}...`);
      console.log(`  -> pdfUrl: ${pdfUrl}`);
      updated++;
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
}

backfillPdfUrls();
