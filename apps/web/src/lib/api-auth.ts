import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

export type AuthMethod = 'session' | 'api_key' | 'legacy';

export interface AuthenticatedUser {
  userId: string;
  authMethod: AuthMethod;
  tier: 'free' | 'pro';
  scopes?: string[];
}

/**
 * Get the admin Supabase client (service role, bypasses RLS).
 * Used for API key lookups and profile queries.
 */
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Primary auth function for all API routes.
 * Returns authenticated user info or null (caller should return 401).
 *
 * Auth methods (in priority order):
 * 1. Session auth (browser) - JWT from cookies via @supabase/ssr
 * 2. Personal API key - Bearer token starting with "ak_"
 * 3. Legacy fallback - EXTERNAL_API_KEY maps to DEFAULT_USER_ID (migration period only)
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  // 1. Try session auth (cookie-based JWT)
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const tier = await getUserTierFromProfile(user.id);
      return { userId: user.id, authMethod: 'session', tier };
    }
  } catch {
    // Session auth failed, try other methods
  }

  // 2. Try personal API key (Bearer ak_...)
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token) {
      // Check for personal API key (starts with ak_)
      if (token.startsWith('ak_')) {
        return validatePersonalApiKey(token);
      }

      // 3. Legacy: EXTERNAL_API_KEY fallback
      const legacyKey = process.env.EXTERNAL_API_KEY;
      const defaultUserId = process.env.DEFAULT_USER_ID;
      if (legacyKey && token === legacyKey && defaultUserId) {
        return {
          userId: defaultUserId,
          authMethod: 'legacy',
          tier: 'pro', // Legacy key gets pro access
        };
      }
    }
  }

  // Also check X-API-Key header for legacy compat
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey) {
    const legacyKey = process.env.EXTERNAL_API_KEY;
    const defaultUserId = process.env.DEFAULT_USER_ID;
    if (legacyKey && xApiKey === legacyKey && defaultUserId) {
      return {
        userId: defaultUserId,
        authMethod: 'legacy',
        tier: 'pro',
      };
    }
  }

  return null;
}

/**
 * Helper to return a 401 response.
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Validate a personal API key (ak_...).
 * Hashes the key, looks up in api_keys table, checks revocation/expiry.
 */
export async function validatePersonalApiKey(
  rawKey: string
): Promise<AuthenticatedUser | null> {
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const admin = getAdminClient();

  const { data, error } = await admin
    .from('api_keys')
    .select('user_id, scopes')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .or('expires_at.is.null,expires_at.gt.now()')
    .single();

  if (error || !data) {
    return null;
  }

  // Update last_used_at (fire-and-forget)
  admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', keyHash)
    .then(() => {});

  const tier = await getUserTierFromProfile(data.user_id);

  return {
    userId: data.user_id,
    authMethod: 'api_key',
    tier,
    scopes: data.scopes,
  };
}

/**
 * Check if a user has a required scope (for API key auth).
 * Session and legacy auth methods have all scopes.
 */
export function hasScope(auth: AuthenticatedUser, scope: string): boolean {
  if (auth.authMethod === 'session' || auth.authMethod === 'legacy') {
    return true;
  }
  return auth.scopes?.includes(scope) ?? false;
}

/**
 * Fetch user tier from user_profiles table.
 */
async function getUserTierFromProfile(
  userId: string
): Promise<'free' | 'pro'> {
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from('user_profiles')
      .select('tier, stripe_subscription_status, subscription_current_period_end')
      .eq('id', userId)
      .single();

    if (!data || data.tier !== 'pro') return 'free';

    // Verify subscription is active and not expired
    const status = data.stripe_subscription_status;
    if (status && !['active', 'trialing'].includes(status)) return 'free';

    const periodEnd = data.subscription_current_period_end;
    if (periodEnd && new Date(periodEnd) < new Date()) return 'free';

    return 'pro';
  } catch {
    return 'free';
  }
}

/**
 * CSRF protection for mutation endpoints.
 * Verify Origin header matches allowed origins (defense-in-depth, not sole auth).
 */
export function checkCsrf(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Non-browser requests (API keys) don't send Origin

  // Chrome extensions use their own origin - CSRF doesn't apply to API key auth
  if (origin.startsWith('chrome-extension://')) return true;

  const allowedOrigins = [
    'https://archivvve.com',
    'https://www.archivvve.com',
    'http://localhost:3000',
    'http://localhost:3001',
  ];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) allowedOrigins.push(appUrl);

  return allowedOrigins.some((allowed) => origin.startsWith(allowed));
}

/**
 * Sanitize a value for use in PostgREST .or() filter strings.
 * Escapes characters that have special meaning in PostgREST filters.
 */
export function sanitizeFilterValue(value: string): string {
  return value.replace(/[.,()\\]/g, '');
}
