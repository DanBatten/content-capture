/**
 * Utility for extracting and filtering URLs from text content
 */

// Match HTTP(S) URLs, stopping at common text boundaries
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

// Domains to skip (social media, CDN, image hosts)
const SKIP_DOMAINS = [
  'twitter.com',
  'x.com',
  't.co', // Twitter's URL shortener
  'pic.twitter.com',
  'pbs.twimg.com',
  'abs.twimg.com',
  'video.twimg.com',
  'instagram.com',
  'facebook.com',
  'fb.com',
  'linkedin.com',
  'pinterest.com',
  'pin.it',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'vimeo.com',
];

// File extensions to skip (media files already captured)
const SKIP_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mp3',
  '.wav',
];

/**
 * Extract URLs from text content, filtering out social media and media files
 */
export function extractLinksFromText(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];

  return matches
    .map((url) => cleanUrl(url))
    .filter((url) => {
      const lowerUrl = url.toLowerCase();

      // Skip social media domains
      if (SKIP_DOMAINS.some((domain) => lowerUrl.includes(domain))) {
        return false;
      }

      // Skip media file extensions
      if (SKIP_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext))) {
        return false;
      }

      return true;
    })
    // Remove duplicates
    .filter((url, index, self) => self.indexOf(url) === index);
}

/**
 * Clean up extracted URLs (remove trailing punctuation, etc.)
 */
function cleanUrl(url: string): string {
  // Remove trailing punctuation that might have been captured
  return url.replace(/[.,;:!?)\]}>]+$/, '');
}

/**
 * Check if a URL points to a PDF
 */
export function isPdfUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.endsWith('.pdf') ||
    lowerUrl.includes('/pdf/') ||
    lowerUrl.includes('type=pdf') ||
    lowerUrl.includes('format=pdf')
  );
}

/**
 * Check if a URL is likely an article (not a homepage or category page)
 */
export function isLikelyArticleUrl(url: string): boolean {
  const path = new URL(url).pathname;

  // Skip root paths and very short paths
  if (path === '/' || path.length < 5) {
    return false;
  }

  // Look for article-like path patterns
  const articlePatterns = [
    /\/\d{4}\/\d{2}\//, // Date-based paths (e.g., /2024/01/)
    /\/article\//i,
    /\/post\//i,
    /\/blog\//i,
    /\/news\//i,
    /\/story\//i,
    /\/p\/[a-z0-9-]+/i, // Medium-style paths
    /-[a-z0-9]{8,}$/i, // Slug with ID suffix
  ];

  return articlePatterns.some((pattern) => pattern.test(path));
}

/**
 * Expand t.co shortened URLs by following redirects
 */
export async function expandShortUrl(url: string): Promise<string> {
  if (!url.includes('t.co')) {
    return url;
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ContentCapture/1.0)',
      },
    });

    const location = response.headers.get('location');
    return location || url;
  } catch {
    return url;
  }
}
