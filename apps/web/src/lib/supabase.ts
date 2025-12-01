import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CaptureStatus, SourceType } from '@content-capture/core';

// Lazy initialization to avoid build-time errors
let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (_supabase) return _supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  _supabase = createClient(url, anonKey);
  return _supabase;
}

function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }

  // Use service role key if available, otherwise fall back to anon key
  const key = serviceKey || anonKey;
  if (!key) {
    throw new Error('Missing Supabase key');
  }

  _supabaseAdmin = createClient(url, key);
  return _supabaseAdmin;
}

// Export getters instead of direct clients
export const supabase = {
  get client() {
    return getSupabaseClient();
  },
};

export const supabaseAdmin = {
  get client() {
    return getSupabaseAdmin();
  },
};

// Database row type (snake_case from Postgres)
export interface ContentItemRow {
  id: string;
  source_url: string;
  source_type: SourceType;
  title: string | null;
  description: string | null;
  body_text: string | null;
  author_name: string | null;
  author_handle: string | null;
  published_at: string | null;
  images: unknown[];
  videos: unknown[];
  summary: string | null;
  topics: string[];
  disciplines: string[];
  use_cases: string[];
  content_type: string | null;
  platform_data: Record<string, unknown> | null;
  notion_page_id: string | null;
  notion_synced_at: string | null;
  status: CaptureStatus;
  error_message: string | null;
  captured_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Create a new capture record
 */
export async function createCapture(
  url: string,
  sourceType: SourceType,
  notes?: string
): Promise<{ id: string } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('content_items')
    .insert({
      source_url: url,
      source_type: sourceType,
      status: 'pending' as CaptureStatus,
      captured_at: new Date().toISOString(),
      images: [],
      videos: [],
      topics: [],
      disciplines: [],
      use_cases: [],
      platform_data: notes ? { user_notes: notes } : null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating capture:', error);
    return null;
  }

  return data;
}

/**
 * Get capture by ID
 */
export async function getCaptureById(id: string): Promise<ContentItemRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('content_items')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching capture:', error);
    return null;
  }

  return data;
}

/**
 * Check if URL already exists
 */
export async function captureExists(url: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from('content_items')
    .select('id')
    .eq('source_url', url)
    .single();

  return !!data;
}

/**
 * Get recent captures
 */
export async function getRecentCaptures(limit = 20): Promise<ContentItemRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('content_items')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent captures:', error);
    return [];
  }

  return data || [];
}

/**
 * Update capture status
 */
export async function updateCaptureStatus(
  id: string,
  status: CaptureStatus,
  errorMessage?: string
): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from('content_items')
    .update({
      status,
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return !error;
}
