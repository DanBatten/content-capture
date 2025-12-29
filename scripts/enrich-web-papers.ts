/**
 * Enrich web items that are arxiv papers
 */
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function scrapeArxivPdf(url: string): Promise<string | null> {
  // Normalize URL to get PDF
  let pdfUrl = url;
  if (url.includes('/abs/')) {
    pdfUrl = url.replace('/abs/', '/pdf/') + '.pdf';
  } else if (!url.endsWith('.pdf')) {
    pdfUrl = url + '.pdf';
  }

  console.log('  Fetching PDF:', pdfUrl);

  const pdfParse = (await import('pdf-parse')).default;
  const response = await fetch(pdfUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!response.ok) {
    console.log('  PDF error:', response.status);
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const data = await pdfParse(buffer);

  return data.text.replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log('='.repeat(50));
  console.log('Enrich Web ArXiv Papers');
  console.log('='.repeat(50));

  // Get web items that are arxiv papers
  const { data: papers } = await supabase
    .from('content_items')
    .select('id, source_url, title, body_text, summary, topics')
    .eq('source_type', 'web')
    .or('source_url.ilike.%arxiv%');

  console.log('Found', papers?.length || 0, 'web arxiv items\n');

  let updated = 0;

  for (const paper of papers || []) {
    console.log('Processing:', paper.source_url);
    console.log('  Current body length:', paper.body_text?.length || 0);

    if (paper.body_text && paper.body_text.length > 10000) {
      console.log('  Already has substantial content, skipping');
      continue;
    }

    const pdfText = await scrapeArxivPdf(paper.source_url);
    if (!pdfText) continue;

    console.log('  Extracted', pdfText.length, 'chars');

    // Generate embedding
    const embeddingText = [
      paper.title ? 'Title: ' + paper.title : '',
      paper.summary ? 'Summary: ' + paper.summary : '',
      'Content: ' + pdfText.slice(0, 10000),
    ].join('\n\n');

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: embeddingText.slice(0, 8191 * 4),
      dimensions: 1536,
    });

    const embedding = embeddingResponse.data[0].embedding;

    // Update
    const { error } = await supabase
      .from('content_items')
      .update({
        body_text: pdfText.slice(0, 30000),
        embedding: '[' + embedding.join(',') + ']',
        embedding_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', paper.id);

    if (error) {
      console.log('  Update error:', error.message);
    } else {
      console.log('  Updated!');
      updated++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Done! Updated:', updated);
}

main().catch(console.error);
