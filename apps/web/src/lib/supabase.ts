import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CaptureStatus, SourceType, NoteStatus } from '@content-capture/core';
import { createHash, randomUUID } from 'crypto';

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

// =============================================================================
// Notes Functions
// =============================================================================

// Database row type for notes (snake_case from Postgres)
export interface NoteRow {
  id: string;
  user_id: string;
  raw_text: string;
  cleaned_text: string | null;
  expanded_text: string | null;
  title: string | null;
  short_title: string | null;
  content_hash: string | null;
  background_image: string | null;
  thumbnail_url: string | null;
  summary: string | null;
  topics: string[];
  disciplines: string[];
  use_cases: string[];
  llm_warnings: string[] | null;
  llm_model: string | null;
  llm_prompt_version: string | null;
  embedding: number[] | null;
  embedding_generated_at: string | null;
  platform_data: Record<string, unknown> | null;
  status: NoteStatus;
  error_message: string | null;
  processing_attempts: number;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

// Number of background images available
const BACKGROUND_IMAGE_COUNT = 5;

/**
 * Normalize text for hashing (consistent whitespace)
 */
function normalizeTextForHash(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Generate content hash for idempotency
 */
export function generateContentHash(text: string): string {
  const normalized = normalizeTextForHash(text);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Select background image deterministically based on note ID
 */
function selectBackgroundImage(noteId: string): string {
  const hash = createHash('sha256').update(noteId).digest();
  const index = hash.readUInt32BE(0) % BACKGROUND_IMAGE_COUNT;
  return `note-backgrounds/photo-${String(index + 1).padStart(2, '0')}.jpg`;
}

/**
 * Check if a note with the same content hash exists for the user
 */
export async function getNoteByContentHash(
  userId: string,
  contentHash: string
): Promise<NoteRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .eq('content_hash', contentHash)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned
    console.error('Error checking note by hash:', error);
  }

  return data;
}

/**
 * Create a new note record
 */
export async function createNote(
  userId: string,
  text: string,
  contentHash: string
): Promise<{ id: string; backgroundImage: string } | null> {
  // Generate a UUID first so we can deterministically select background
  const noteId = randomUUID();
  const backgroundImage = selectBackgroundImage(noteId);

  const { data, error } = await getSupabaseAdmin()
    .from('notes')
    .insert({
      id: noteId,
      user_id: userId,
      raw_text: text,
      content_hash: contentHash,
      background_image: backgroundImage,
      status: 'pending' as NoteStatus,
      topics: [],
      disciplines: [],
      use_cases: [],
      processing_attempts: 0,
    })
    .select('id, background_image')
    .single();

  if (error) {
    console.error('Error creating note:', error);
    return null;
  }

  return { id: data.id, backgroundImage: data.background_image };
}

/**
 * Get note by ID
 */
export async function getNoteById(id: string): Promise<NoteRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('notes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching note:', error);
    return null;
  }

  return data;
}

/**
 * List notes with cursor pagination
 */
export async function listNotes(
  userId: string,
  options: {
    limit?: number;
    cursor?: { createdAt: string; id: string };
    status?: NoteStatus;
    topic?: string;
    search?: string;
  } = {}
): Promise<{ notes: NoteRow[]; nextCursor?: { createdAt: string; id: string } }> {
  const { limit = 20, cursor, status, topic, search } = options;

  let query = getSupabaseAdmin()
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1); // Fetch one extra to check for more

  if (cursor) {
    // Cursor pagination: get items older than cursor
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (topic) {
    query = query.contains('topics', [topic]);
  }

  if (search) {
    query = query.textSearch('raw_text', search, { type: 'websearch' });
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error listing notes:', error);
    return { notes: [] };
  }

  const notes = data || [];
  let nextCursor: { createdAt: string; id: string } | undefined;

  if (notes.length > limit) {
    const lastNote = notes[limit - 1];
    nextCursor = { createdAt: lastNote.created_at, id: lastNote.id };
    notes.pop(); // Remove the extra item
  }

  return { notes: notes.slice(0, limit), nextCursor };
}

/**
 * Delete a note
 */
export async function deleteNote(id: string, userId: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting note:', error);
    return false;
  }

  return true;
}
