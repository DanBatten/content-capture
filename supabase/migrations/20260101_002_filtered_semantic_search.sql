-- Add filtered semantic search function for knowledge base scoping

-- Function for semantic search with optional topic filter
CREATE OR REPLACE FUNCTION search_content_semantic_filtered(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10,
  topic_filter TEXT DEFAULT NULL
)
RETURNS SETOF content_items AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM content_items
  WHERE embedding IS NOT NULL
    AND status = 'complete'
    AND 1 - (embedding <=> query_embedding) > match_threshold
    AND (topic_filter IS NULL OR topic_filter = ANY(topics))
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_content_semantic_filtered IS 'Semantic search with optional topic filtering for knowledge base scoping';
