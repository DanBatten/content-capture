import { NextRequest, NextResponse } from 'next/server';
import { getNoteById, deleteNote, type NoteRow } from '@/lib/supabase';
import { getAuthenticatedUser, unauthorizedResponse, hasScope, checkCsrf } from '@/lib/api-auth';

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

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  if (!hasScope(auth, 'read')) {
    return NextResponse.json({ error: 'Insufficient scope. Required: read' }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const note = await getNoteById(id);

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    if (note.user_id !== auth.userId) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    return NextResponse.json(transformNoteRow(note));
  } catch (error) {
    console.error('Note fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return unauthorizedResponse();

  if (!checkCsrf(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const deleted = await deleteNote(id, auth.userId);

    if (!deleted) {
      return NextResponse.json({ error: 'Note not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Note delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
