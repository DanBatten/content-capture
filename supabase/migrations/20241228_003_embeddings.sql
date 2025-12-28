-- Migration: Vector Embeddings
-- Adds pgvector support for semantic search and RAG

-- Enable pgvector extension (Supabase has this available)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (1536 dimensions for OpenAI text-embedding-3-small)
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Track when embedding was generated
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS embedding_generated_at TIMESTAMPTZ;

-- HNSW index for fast approximate nearest neighbor search
-- Using cosine distance (most common for text embeddings)
CREATE INDEX IF NOT EXISTS idx_content_embedding ON content_items
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Function for semantic search
-- Returns content items ordered by similarity to the query embedding
CREATE OR REPLACE FUNCTION search_content_semantic(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10
)
RETURNS SETOF content_items AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM content_items
  WHERE embedding IS NOT NULL
    AND status = 'complete'
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get similar content to a specific item
CREATE OR REPLACE FUNCTION get_similar_content(
  content_id UUID,
  match_count INT DEFAULT 5
)
RETURNS SETOF content_items AS $$
DECLARE
  source_embedding vector(1536);
BEGIN
  -- Get the embedding of the source content
  SELECT embedding INTO source_embedding
  FROM content_items
  WHERE id = content_id;

  IF source_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM content_items
  WHERE embedding IS NOT NULL
    AND status = 'complete'
    AND id != content_id
  ORDER BY embedding <=> source_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON COLUMN content_items.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions)';
COMMENT ON COLUMN content_items.embedding_generated_at IS 'Timestamp when embedding was generated';
COMMENT ON FUNCTION search_content_semantic IS 'Semantic search using cosine similarity';
COMMENT ON FUNCTION get_similar_content IS 'Find content similar to a given item';
