import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '24');
    const offset = (page - 1) * limit;

    // Filters
    const sourceType = searchParams.get('source_type');
    const topic = searchParams.get('topic');
    const search = searchParams.get('search');
    const status = searchParams.get('status') || 'complete';

    // Build query
    let query = supabase
      .from('content_items')
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    if (topic) {
      query = query.contains('topics', [topic]);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,body_text.ilike.%${search}%`);
    }

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
  } catch (error) {
    console.error('Items API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
