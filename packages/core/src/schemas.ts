import { z } from 'zod';

export const sourceTypeSchema = z.enum(['twitter', 'instagram', 'linkedin', 'pinterest', 'web']);

export const contentTypeSchema = z.enum(['post', 'article', 'thread', 'image', 'video']);

export const captureStatusSchema = z.enum(['pending', 'processing', 'complete', 'failed']);

export const captureRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
  notes: z.string().optional(),
});

export const analysisResultSchema = z.object({
  summary: z.string().max(500),
  topics: z.array(z.string()).min(1).max(5),
  discipline: z.string(),
  useCases: z.array(z.string()).min(1).max(3),
  contentType: contentTypeSchema,
});

/**
 * Detect the source platform from a URL
 */
export function detectSourceType(url: string): z.infer<typeof sourceTypeSchema> {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
    return 'twitter';
  }
  if (urlLower.includes('instagram.com')) {
    return 'instagram';
  }
  if (urlLower.includes('linkedin.com')) {
    return 'linkedin';
  }
  if (urlLower.includes('pinterest.com') || urlLower.includes('pin.it')) {
    return 'pinterest';
  }

  return 'web';
}

/**
 * Validate and parse a URL
 */
export function validateUrl(url: string): { valid: boolean; normalized?: string; error?: string } {
  try {
    const parsed = new URL(url);

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are supported' };
    }

    // Normalize the URL
    const normalized = parsed.href;

    return { valid: true, normalized };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
