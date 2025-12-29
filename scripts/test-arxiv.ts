import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../apps/web/.env.local') });

async function scrapeArxiv(url: string) {
  console.log('Testing arxiv scraper on:', url);

  try {
    // First, get metadata from the abstract page
    console.log('\n1. Fetching abstract page...');
    const abstractResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (abstractResponse.ok) {
      const html = await abstractResponse.text();
      const $ = cheerio.load(html);

      const title = $('meta[name="citation_title"]').attr('content')
        || $('h1.title').text().replace('Title:', '').trim()
        || null;

      const authors = $('meta[name="citation_author"]')
        .map((_, el) => $(el).attr('content'))
        .get()
        .join(', ');

      const abstract = $('meta[name="citation_abstract"]').attr('content')
        || $('blockquote.abstract').text().replace('Abstract:', '').trim()
        || null;

      console.log('\n--- Metadata ---');
      console.log('Title:', title?.slice(0, 100));
      console.log('Authors:', authors.slice(0, 100));
      console.log('Abstract preview:', abstract?.slice(0, 200) + '...');
    }

    // Get PDF
    const pdfUrl = url.replace('/abs/', '/pdf/') + '.pdf';
    console.log('\n2. Fetching PDF:', pdfUrl);

    const pdfParse = (await import('pdf-parse')).default;
    const pdfResponse = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)' },
    });

    if (!pdfResponse.ok) {
      console.log('PDF error:', pdfResponse.status);
      return;
    }

    const buffer = Buffer.from(await pdfResponse.arrayBuffer());
    const data = await pdfParse(buffer);

    console.log('\n--- PDF Content ---');
    console.log('Total text length:', data.text.length, 'characters');
    console.log('Preview (first 800 chars):');
    console.log(data.text.slice(0, 800));
    console.log('\n...\n');
    console.log('(end of preview)');

  } catch (err) {
    console.error('Error:', err);
  }
}

// Test with a sample arxiv URL
scrapeArxiv('https://arxiv.org/abs/2512.02472');
