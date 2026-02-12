import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'crypto';
import { getAuthenticatedUser, unauthorizedResponse, checkCsrf } from '@/lib/api-auth';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const MAX_ACTIVE_KEYS = 5;

/**
 * GET /api/keys - List user's API keys
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  const admin = getAdminClient();
  const { data: keys } = await admin
    .from('api_keys')
    .select('id, key_prefix, name, scopes, last_used_at, created_at, revoked_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  return NextResponse.json({ keys: keys || [] });
}

/**
 * POST /api/keys - Generate a new API key
 */
export async function POST(request: NextRequest) {
  if (!checkCsrf(request)) {
    return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  const body = await request.json();
  const name = body.name?.trim();
  const scopes = body.scopes || ['capture', 'read'];

  if (!name) {
    return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Check active key count
  const { count } = await admin
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .is('revoked_at', null);

  if ((count || 0) >= MAX_ACTIVE_KEYS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ACTIVE_KEYS} active keys allowed. Revoke an existing key first.` },
      { status: 400 }
    );
  }

  // Generate key
  const rawKey = 'ak_' + randomBytes(32).toString('hex');
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 11); // "ak_" + 8 chars

  const { error } = await admin.from('api_keys').insert({
    user_id: auth.userId,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    name,
    scopes,
  });

  if (error) {
    console.error('Failed to create API key:', error);
    return NextResponse.json({ error: 'Failed to create key' }, { status: 500 });
  }

  // Return raw key once - it won't be retrievable after this
  return NextResponse.json({ key: rawKey, prefix: keyPrefix });
}

/**
 * DELETE /api/keys?id=<key_id> - Revoke an API key
 */
export async function DELETE(request: NextRequest) {
  if (!checkCsrf(request)) {
    return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 });
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  const keyId = request.nextUrl.searchParams.get('id');
  if (!keyId) {
    return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Verify ownership before revoking
  const { data: key } = await admin
    .from('api_keys')
    .select('user_id')
    .eq('id', keyId)
    .single();

  if (!key || key.user_id !== auth.userId) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  }

  await admin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId);

  return NextResponse.json({ revoked: true });
}
