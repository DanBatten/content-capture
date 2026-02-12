import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, unauthorizedResponse, hasScope, sanitizeFilterValue } from '@/lib/api-auth';

const GCS_BUCKET = 'web-scrapbook-content-capture-media';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function transformNoteToContentItem(note: any) {
  const bgImage = note.background_image
    ? note.background_image.replace(/note-backgrounds\/photo-/i, 'note-backgrounds/Photo-')
    : null;
  const backgroundUrl = bgImage
    ? `https://storage.googleapis.com/${GCS_BUCKET}/${bgImage}`
    : `https://storage.googleapis.com/${GCS_BUCKET}/note-backgrounds/Photo-01.jpg`;

  return {
    id: note.id,
    source_url: `note://${note.id}`,
    source_type: 'note',
    title: note.title || note.short_title || 'Untitled Note',
    description: note.summary || note.cleaned_text?.slice(0, 200),
    body_text: note.cleaned_text || note.raw_text,
    author_name: null,
    author_handle: null,
    published_at: note.created_at,
    images: [{ url: backgroundUrl, publicUrl: backgroundUrl }],
    videos: [],
    summary: note.summary,
    topics: note.topics || [],
    disciplines: note.disciplines || [],
    use_cases: note.use_cases || [],
    content_type: 'note',
    platform_data: {
      isNote: true,
      shortTitle: note.short_title,
      rawText: note.raw_text,
      expandedText: note.expanded_text,
      llmWarnings: note.llm_warnings,
      backgroundImage: note.background_image,
    },
    status: note.status,
    error_message: note.error_message,
    captured_at: note.created_at,
    processed_at: note.processed_at,
    created_at: note.created_at,
    updated_at: note.updated_at,
  };
}

export async function GET(request: NextRequest) {
  // Authenticate
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  if (!hasScope(auth, 'read')) {
    return NextResponse.json({ error: 'Insufficient scope. Required: read' }, { status: 403 });
  }

  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const { userId } = auth;

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '24');
    const offset = (page - 1) * limit;

    const sourceType = searchParams.get('source_type');
    const topic = searchParams.get('topic');
    const rawSearch = searchParams.get('search');
    const search = rawSearch ? sanitizeFilterValue(rawSearch) : null;
    const status = searchParams.get('status') || 'complete';

    // Notes-only query
    if (sourceType === 'note') {
      let notesQuery = supabase
        .from('notes')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (topic) notesQuery = notesQuery.contains('topics', [topic]);
      if (search) notesQuery = notesQuery.or(`title.ilike.%${search}%,cleaned_text.ilike.%${search}%,raw_text.ilike.%${search}%`);

      const { data: notes, error, count } = await notesQuery;
      if (error) {
        console.error('Notes database error:', error);
        return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
      }

      return NextResponse.json({
        items: (notes || []).map(transformNoteToContentItem),
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      });
    }

    // Specific source type (not notes)
    if (sourceType) {
      let query = supabase
        .from('content_items')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', status)
        .eq('source_type', sourceType)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (topic) query = query.contains('topics', [topic]);
      if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,body_text.ilike.%${search}%`);

      const { data, error, count } = await query;
      if (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
      }

      return NextResponse.json({
        items: data || [],
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      });
    }

    // No source type filter - merge both tables
    let contentQuery = supabase
      .from('content_items')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', status)
      .order('created_at', { ascending: false });

    let notesQuery = supabase
      .from('notes')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (topic) {
      contentQuery = contentQuery.contains('topics', [topic]);
      notesQuery = notesQuery.contains('topics', [topic]);
    }

    if (search) {
      contentQuery = contentQuery.or(`title.ilike.%${search}%,description.ilike.%${search}%,body_text.ilike.%${search}%`);
      notesQuery = notesQuery.or(`title.ilike.%${search}%,cleaned_text.ilike.%${search}%,raw_text.ilike.%${search}%`);
    }

    const [contentResult, notesResult] = await Promise.all([contentQuery, notesQuery]);

    if (contentResult.error) {
      console.error('Content items database error:', contentResult.error);
      return NextResponse.json({ error: 'Failed to fetch content items' }, { status: 500 });
    }
    if (notesResult.error) {
      console.error('Notes database error:', notesResult.error);
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }

    const transformedNotes = (notesResult.data || []).map(transformNoteToContentItem);
    const contentItems = contentResult.data || [];

    const allItems = [...contentItems, ...transformedNotes].sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const paginatedItems = allItems.slice(offset, offset + limit);
    const totalCount = (contentResult.count || 0) + (notesResult.count || 0);

    return NextResponse.json({
      items: paginatedItems,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error('Items API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
