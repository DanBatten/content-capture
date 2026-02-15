import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface RateLimitConfig {
  endpoint: string;
  proLimit: number;
  basicLimit: number;
  freeLimit: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  chat: { endpoint: 'chat', proLimit: 100, basicLimit: 0, freeLimit: 0 },
  deep_research: { endpoint: 'deep_research', proLimit: 20, basicLimit: 0, freeLimit: 0 },
  search: { endpoint: 'search', proLimit: 500, basicLimit: 300, freeLimit: 200 },
};

/**
 * Check if a user has exceeded their daily rate limit for an endpoint.
 * Returns null if within limits, or a 429 response if exceeded.
 */
export async function checkRateLimit(
  userId: string,
  tier: 'free' | 'basic' | 'pro',
  limitKey: string
): Promise<NextResponse | null> {
  const config = RATE_LIMITS[limitKey];
  if (!config) return null;

  const limit = tier === 'pro' ? config.proLimit : tier === 'basic' ? config.basicLimit : config.freeLimit;

  // If limit is 0, this feature is blocked at the tier level (handled separately)
  if (limit === 0) return null;

  const admin = getAdminClient();
  const today = new Date().toISOString().split('T')[0];

  const { data } = await admin
    .from('usage_tracking')
    .select('request_count')
    .eq('user_id', userId)
    .eq('endpoint', config.endpoint)
    .eq('date', today)
    .single();

  const currentCount = data?.request_count || 0;

  if (currentCount >= limit) {
    // Calculate seconds until midnight UTC
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    const retryAfter = Math.ceil((midnight.getTime() - now.getTime()) / 1000);

    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        limit,
        current: currentCount,
        resetsAt: midnight.toISOString(),
      },
      {
        status: 429,
        headers: { 'Retry-After': retryAfter.toString() },
      }
    );
  }

  return null;
}

/**
 * Track usage after a successful request.
 * Uses the atomic track_usage RPC function.
 */
export async function trackUsage(
  userId: string,
  endpoint: string,
  tokens: number = 0
): Promise<void> {
  try {
    const admin = getAdminClient();
    await admin.rpc('track_usage', {
      p_user_id: userId,
      p_endpoint: endpoint,
      p_tokens: tokens,
    });
  } catch (error) {
    // Fire-and-forget - don't fail the request
    console.error('Failed to track usage:', error);
  }
}
