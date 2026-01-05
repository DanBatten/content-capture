import { NextRequest, NextResponse } from 'next/server';
import { getNoteById, deleteNote, type NoteRow } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';

/**
 * Get the default user ID for single-user mode
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

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/notes/[id] - Get a single note
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  // Check authentication
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const userId = getDefaultUserId();

    const note = await getNoteById(id);

    if (!note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (note.user_id !== userId) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(transformNoteRow(note));
  } catch (error) {
    console.error('Note fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notes/[id] - Delete a note
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  // Check authentication
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const userId = getDefaultUserId();

    const deleted = await deleteNote(id, userId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Note not found or already deleted' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Note delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
