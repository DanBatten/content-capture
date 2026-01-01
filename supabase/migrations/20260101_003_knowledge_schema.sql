-- Knowledge Page Schema
-- Tables and functions for the Knowledge page feature

-- User preferences for pinned topics and custom knowledge bases
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID, -- NULL for single-user, future-proofing for multi-user
  pinned_topics TEXT[] DEFAULT '{}',
  custom_knowledge_bases JSONB DEFAULT '[]'::jsonb,
  -- custom_knowledge_bases structure:
  -- [{ "name": "AI Research", "topics": ["AI", "Research"], "description": "..." }]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Topic overviews cache for AI-generated content
CREATE TABLE IF NOT EXISTS topic_overviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_name TEXT NOT NULL UNIQUE,
  overview_text TEXT,
  suggested_prompts JSONB DEFAULT '[]'::jsonb,
  item_count INT DEFAULT 0,
  representative_image_url TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (open for single-user app)
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_overviews ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single-user app)
CREATE POLICY "Allow all operations on user_preferences" ON user_preferences
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on topic_overviews" ON topic_overviews
  FOR ALL USING (true) WITH CHECK (true);

-- Function to get topic statistics with representative images
CREATE OR REPLACE FUNCTION get_topic_stats()
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
      unnest(topics) as topic,
      images,
      platform_data,
      created_at
    FROM content_items
    WHERE status = 'complete'
  ),
  topic_counts AS (
    SELECT
      topic,
      COUNT(*) as cnt,
      MAX(created_at) as latest_date
    FROM topic_items
    GROUP BY topic
  ),
  topic_images AS (
    SELECT DISTINCT ON (topic)
      topic,
      COALESCE(
        platform_data->>'screenshot',
        images->0->>'publicUrl',
        images->0->>'originalUrl',
        images->0->>'url'
      ) as image_url
    FROM topic_items
    WHERE (images IS NOT NULL AND jsonb_array_length(images) > 0)
       OR platform_data->>'screenshot' IS NOT NULL
    ORDER BY topic, created_at DESC
  )
  SELECT
    tc.topic,
    tc.cnt,
    ti.image_url,
    tc.latest_date
  FROM topic_counts tc
  LEFT JOIN topic_images ti ON tc.topic = ti.topic
  ORDER BY tc.cnt DESC;
END;
$$ LANGUAGE plpgsql;

-- Insert default user preferences if not exists
INSERT INTO user_preferences (pinned_topics, custom_knowledge_bases)
SELECT '{}', '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM user_preferences LIMIT 1);

-- Add comments for documentation
COMMENT ON TABLE user_preferences IS 'Stores user preferences for pinned topics and custom knowledge bases';
COMMENT ON TABLE topic_overviews IS 'Cached AI-generated overviews for topic pages';
COMMENT ON FUNCTION get_topic_stats IS 'Returns topic statistics with item counts and representative images';
