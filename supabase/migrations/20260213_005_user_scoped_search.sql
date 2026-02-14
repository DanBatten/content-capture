-- Migration 005: User-scoped search functions
-- Updates all search functions to accept p_user_id parameter
-- Service role key bypasses RLS, so we filter explicitly in functions
-- Must DROP old signatures first since adding a parameter creates a new overload

BEGIN;

-- ============================================================
-- Drop old function signatures (exact original param lists)
-- ============================================================
DROP FUNCTION IF EXISTS search_content_semantic(vector(1536), FLOAT, INT);
DROP FUNCTION IF EXISTS get_similar_content(UUID, INT);
DROP FUNCTION IF EXISTS search_content_semantic_filtered(vector(1536), FLOAT, INT, TEXT);
DROP FUNCTION IF EXISTS get_topic_stats();

-- ============================================================
-- search_content_semantic - with user scoping
-- ============================================================
CREATE OR REPLACE FUNCTION search_content_semantic(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10,
  p_user_id UUID DEFAULT NULL
)
RETURNS SETOF content_items AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM content_items
  WHERE embedding IS NOT NULL
    AND status = 'complete'
    AND 1 - (embedding <=> query_embedding) > match_threshold
    AND (p_user_id IS NULL OR user_id = p_user_id)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- get_similar_content - with user scoping
-- ============================================================
CREATE OR REPLACE FUNCTION get_similar_content(
  content_id UUID,
  match_count INT DEFAULT 5,
  p_user_id UUID DEFAULT NULL
)
RETURNS SETOF content_items AS $$
DECLARE
  source_embedding vector(1536);
BEGIN
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
    AND (p_user_id IS NULL OR user_id = p_user_id)
  ORDER BY embedding <=> source_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- search_content_semantic_filtered - with user scoping
-- ============================================================
CREATE OR REPLACE FUNCTION search_content_semantic_filtered(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10,
  topic_filter TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
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
    AND (p_user_id IS NULL OR user_id = p_user_id)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- get_topic_stats - with user scoping
-- ============================================================
CREATE OR REPLACE FUNCTION get_topic_stats(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  topic_name TEXT,
  item_count BIGINT,
  representative_image TEXT,
  latest_item_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH topic_items AS (
    SELECT
      unnest(ci.topics) as topic,
      ci.images,
      ci.platform_data,
      ci.created_at
    FROM content_items ci
    WHERE ci.status = 'complete'
      AND (p_user_id IS NULL OR ci.user_id = p_user_id)
  ),
  topic_counts AS (
    SELECT
      ti.topic,
      COUNT(*) as cnt,
      MAX(ti.created_at) as latest_date
    FROM topic_items ti
    GROUP BY ti.topic
  ),
  topic_images AS (
    SELECT DISTINCT ON (ti2.topic)
      ti2.topic,
      COALESCE(
        ti2.platform_data->>'screenshot',
        ti2.images->0->>'publicUrl',
        ti2.images->0->>'originalUrl',
        ti2.images->0->>'url'
      ) as image_url
    FROM topic_items ti2
    WHERE (ti2.images IS NOT NULL AND jsonb_array_length(ti2.images) > 0)
       OR ti2.platform_data->>'screenshot' IS NOT NULL
    ORDER BY ti2.topic, ti2.created_at DESC
  )
  SELECT
    tc.topic,
    tc.cnt,
    timg.image_url,
    tc.latest_date
  FROM topic_counts tc
  LEFT JOIN topic_images timg ON tc.topic = timg.topic
  ORDER BY tc.cnt DESC;
END;
$$ LANGUAGE plpgsql;

COMMIT;

COMMENT ON FUNCTION search_content_semantic(vector(1536), FLOAT, INT, UUID) IS 'Semantic search with optional user scoping';
COMMENT ON FUNCTION get_similar_content(UUID, INT, UUID) IS 'Find similar content with optional user scoping';
COMMENT ON FUNCTION search_content_semantic_filtered(vector(1536), FLOAT, INT, TEXT, UUID) IS 'Semantic search with topic filter and optional user scoping';
COMMENT ON FUNCTION get_topic_stats(UUID) IS 'Topic statistics with optional user scoping';
