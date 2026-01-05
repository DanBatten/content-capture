import { NextRequest, NextResponse } from 'next/server';
import { noteRequestSchema, type NoteMessage } from '@content-capture/core';
import {
  createNote,
  getNoteByContentHash,
  generateContentHash,
  listNotes,
  type NoteRow,
} from '@/lib/supabase';
import { sendNoteToQueue } from '@/lib/pubsub';
import { requireAuth } from '@/lib/api-auth';
import { randomUUID } from 'crypto';

/**
 * Get the default user ID for single-user mode
 * In the future, this will be replaced with proper session-based auth
 */
function getDefaultUserId(): string {
  const userId = process.env.DEFAULT_USER_ID;
  if (!userId) {
    throw new Error('DEFAULT_USER_ID environment variable is not set');
  }
  return userId;
}

/**
 * Transform NoteRow (snake_case) to API response (camelCase)
 */
function transformNoteRow(row: NoteRow) {
  return {
    id: row.id,
    userId: row.user_id,
    rawText: row.raw_text,
    cleanedText: row.cleaned_text,
    expandedText: row.expanded_text,
    title: row.title,
    shortTitle: row.short_title,
    contentHash: row.content_hash,
    backgroundImage: row.background_image,
    thumbnailUrl: row.thumbnail_url,
    summary: row.summary,
    topics: row.topics,
    disciplines: row.disciplines,
    useCases: row.use_cases,
    llmWarnings: row.llm_warnings,
    llmModel: row.llm_model,
    llmPromptVersion: row.llm_prompt_version,
    status: row.status,
    errorMessage: row.error_message,
    processingAttempts: row.processing_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    processedAt: row.processed_at,
  };
}

/**
 * POST /api/notes - Create a new note
 */
export async function POST(request: NextRequest) {
  // Check authentication
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    // Parse and validate request body
    const body = await request.json();
    const parsed = noteRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { text, idempotencyKey } = parsed.data;

    // Get user ID (single-user mode for now)
    const userId = getDefaultUserId();

    // Generate content hash for idempotency
    const contentHash = generateContentHash(text);

    // Check for existing note with same content
    const existing = await getNoteByContentHash(userId, contentHash);
    if (existing) {
      // Return existing note instead of creating duplicate
      return NextResponse.json({
        id: existing.id,
        status: existing.status,
        existing: true,
      });
    }

    // Create pending note record
    const note = await createNote(userId, text, contentHash);
    if (!note) {
      return NextResponse.json(
        { error: 'Failed to create note record' },
        { status: 500 }
      );
    }

    // Generate trace ID for observability
    const traceId = idempotencyKey || randomUUID();

    // Send to processing queue
    const message: NoteMessage = {
      noteId: note.id,
      userId,
      traceId,
    };

    const queued = await sendNoteToQueue(message);
    if (!queued) {
      // Log error but don't fail - record exists, can retry later
      console.error('Failed to queue note:', note.id);
    }

    return NextResponse.json({
      id: note.id,
      status: 'pending',
      existing: false,
    });
  } catch (error) {
    console.error('Note creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notes - List notes with optional filters
 *
 * Query params:
 * - limit: number (default 20, max 100)
 * - cursor: JSON encoded {createdAt, id}
 * - status: pending | processing | complete | failed
 * - topic: string (filter by topic)
 * - q: string (search query)
 */
export async function GET(request: NextRequest) {
  // Check authentication
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const userId = getDefaultUserId();
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '20'),
      100
    );

    let cursor: { createdAt: string; id: string } | undefined;
    const cursorParam = searchParams.get('cursor');
    if (cursorParam) {
      try {
        cursor = JSON.parse(cursorParam);
      } catch {
        return NextResponse.json(
          { error: 'Invalid cursor format' },
          { status: 400 }
        );
      }
    }

    const status = searchParams.get('status') as 'pending' | 'processing' | 'complete' | 'failed' | null;
    const topic = searchParams.get('topic') || undefined;
    const search = searchParams.get('q') || undefined;

    // Fetch notes
    const result = await listNotes(userId, {
      limit,
      cursor,
      status: status || undefined,
      topic,
      search,
    });

    return NextResponse.json({
      notes: result.notes.map(transformNoteRow),
      nextCursor: result.nextCursor
        ? JSON.stringify(result.nextCursor)
        : undefined,
    });
  } catch (error) {
    console.error('Note list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
