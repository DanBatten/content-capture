-- Notes Table Migration
-- Separate table for plain text notes with full user scoping and idempotent processing

-- Extensions (pgcrypto for gen_random_uuid, vector for embeddings)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Status enum (prevents typos, safer than TEXT)
DO $$ BEGIN
  CREATE TYPE note_status AS ENUM ('pending', 'processing', 'complete', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main notes table
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership (future multi-user ready)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content
  raw_text TEXT NOT NULL,              -- Original input (never modified)
  cleaned_text TEXT,                   -- Grammar/punctuation fixes only
  expanded_text TEXT,                  -- Optional: gentle expansion (labeled)
  title TEXT,                          -- Main title (5-10 words)
  short_title TEXT,                    -- 1-3 words for thumbnail overlay

  -- Idempotency
  content_hash TEXT,                   -- sha256(normalized raw_text)

  -- Thumbnail (UI-rendered by default)
  background_image TEXT,               -- GCS key: note-backgrounds/photo-01.jpg
  thumbnail_url TEXT,                  -- Optional: pre-rendered for sharing

  -- AI Analysis (same structure as content_items)
  summary TEXT,
  topics TEXT[] DEFAULT '{}',
  disciplines TEXT[] DEFAULT '{}',
  use_cases TEXT[] DEFAULT '{}',

  -- LLM metadata (for reproducibility)
  llm_warnings TEXT[],                 -- e.g., "unclear acronym: 'PTA'"
  llm_model TEXT,
  llm_prompt_version TEXT,

  -- Embedding for semantic search
  embedding vector(1536),
  embedding_generated_at TIMESTAMPTZ,

  -- Extensible metadata
  platform_data JSONB,

  -- Status & processing
  status note_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  processing_attempts INT NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Constraints (prevent UI-breaking data)
ALTER TABLE notes
  ADD CONSTRAINT notes_title_len CHECK (title IS NULL OR char_length(title) <= 120),
  ADD CONSTRAINT notes_short_title_len CHECK (short_title IS NULL OR char_length(short_title) <= 32),
  ADD CONSTRAINT notes_raw_text_len CHECK (char_length(raw_text) <= 50000);

-- Auto-update timestamp trigger (reuse if exists, create if not)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notes_updated_at ON notes;
CREATE TRIGGER trg_notes_updated_at
BEFORE UPDATE ON notes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX idx_notes_user_created ON notes(user_id, created_at DESC);
CREATE INDEX idx_notes_user_status ON notes(user_id, status);
CREATE UNIQUE INDEX idx_notes_user_content_hash ON notes(user_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX idx_notes_embedding ON notes USING ivfflat (embedding vector_cosine_ops);

-- Full-text search index
CREATE INDEX idx_notes_search ON notes USING GIN(
  to_tsvector('english',
    COALESCE(title, '') || ' ' ||
    COALESCE(cleaned_text, '') || ' ' ||
    COALESCE(raw_text, '') || ' ' ||
    COALESCE(summary, '')
  )
);

-- Row Level Security
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select_own" ON notes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notes_insert_own" ON notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notes_update_own" ON notes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "notes_delete_own" ON notes
  FOR DELETE USING (auth.uid() = user_id);

-- Claim function for idempotent processing
-- Returns TRUE if claim successful, FALSE if already claimed/processed
CREATE OR REPLACE FUNCTION claim_note_for_processing(p_note_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_claimed BOOLEAN;
BEGIN
  UPDATE notes
  SET
    status = 'processing',
    processing_attempts = processing_attempts + 1,
    updated_at = NOW()
  WHERE id = p_note_id
    AND user_id = p_user_id
    AND status = 'pending'
  RETURNING TRUE INTO v_claimed;

  RETURN COALESCE(v_claimed, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Grant execute on claim function
GRANT EXECUTE ON FUNCTION claim_note_for_processing(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_note_for_processing(UUID, UUID) TO service_role;
