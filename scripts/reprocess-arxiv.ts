import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

/**
 * Sanitize text to remove problematic Unicode characters that break JSON/PostgreSQL
 */
function sanitizeText(text: string): string {
  return text
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '') // Remove Unicode replacement chars
    .replace(/[\uE000-\uF8FF]/g, '') // Remove private use area
    .replace(/\s+/g, ' ')
    .trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function reprocessArxiv(itemId: string) {
  // Get the item
  const { data: item, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('id', itemId)
    .single();

  if (error || !item) {
    console.error('Failed to find item:', error);
    return;
  }

  const url = item.source_url;
  console.log(`Re-processing: ${url}`);

  if (!url.includes('arxiv.org/abs/')) {
    console.error('Not an arXiv abstract URL');
    return;
  }

  // Fetch metadata from abstract page
  let title: string | undefined;
  let authorName: string | undefined;
  let description: string | undefined;

  const abstractResponse = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (abstractResponse.ok) {
    const html = await abstractResponse.text();
    const $ = cheerio.load(html);

    title = $('meta[name="citation_title"]').attr('content') ||
      $('h1.title').text().replace('Title:', '').trim() || undefined;

    const authors = $('meta[name="citation_author"]')
      .map((_, el) => $(el).attr('content'))
      .get()
      .join(', ');
    if (authors) authorName = authors;

    description = $('meta[name="citation_abstract"]').attr('content') ||
      $('blockquote.abstract').text().replace('Abstract:', '').trim() || undefined;

    const displayAuthor = authorName ? authorName.slice(0, 50) : 'Unknown';
    console.log(`Got metadata: "${title}" by ${displayAuthor}`);
  }

  // Fetch PDF
  const pdfUrl = url.replace('/abs/', '/pdf/') + '.pdf';
  console.log(`Downloading PDF: ${pdfUrl}`);

  const pdfResponse = await fetch(pdfUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)' },
  });

  if (!pdfResponse.ok) {
    console.error(`Failed to fetch PDF: ${pdfResponse.status}`);
    return;
  }

  const buffer = Buffer.from(await pdfResponse.arrayBuffer());
  const pdf = await pdfParse(buffer);

  const finalTitle = title || pdf.info?.Title || 'Unknown';
  const fullText = sanitizeText(pdf.text);
  const bodyText = description
    ? `ABSTRACT:\n${sanitizeText(description)}\n\nFULL PAPER:\n${fullText}`
    : fullText;

  console.log(`Extracted ${pdf.numpages} pages, ${bodyText.length} chars`);

  // Update the database
  const { error: updateError } = await supabase
    .from('content_items')
    .update({
      title: sanitizeText(finalTitle),
      description: sanitizeText(description || bodyText.slice(0, 500) + '...'),
      body_text: bodyText,
      author_name: authorName ? sanitizeText(authorName) : pdf.info?.Author,
      platform_data: {
        ...(item.platform_data as Record<string, unknown> || {}),
        contentFormat: 'pdf',
        arxivUrl: url,
        pdfUrl: pdfUrl,
        pageCount: pdf.numpages,
        reprocessed_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (updateError) {
    console.error('Failed to update:', updateError);
  } else {
    console.log('Successfully updated!');
  }
}

// Get item ID from command line or use default
const itemId = process.argv[2] || '9d15b9d8-c7fd-4d79-b3e7-8429dd34e23c';
reprocessArxiv(itemId);
