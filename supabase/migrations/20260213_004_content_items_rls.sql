-- Migration 004: Per-user RLS policies on content_items, user_preferences, topic_overviews
-- Replaces the permissive "allow all" policies with user-scoped policies

-- ============================================================
-- content_items RLS
-- ============================================================
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "Allow all operations" ON content_items;
DROP POLICY IF EXISTS "Allow all operations on content_items" ON content_items;

-- Per-user policies
CREATE POLICY "Users can read own content_items" ON content_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own content_items" ON content_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own content_items" ON content_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own content_items" ON content_items
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- user_preferences RLS
-- ============================================================

-- Drop permissive policy
DROP POLICY IF EXISTS "Allow all operations on user_preferences" ON user_preferences;

-- Add user_id to user_preferences if it doesn't have a proper reference
-- (existing table has nullable user_id)
DO $$
BEGIN
  -- Add foreign key if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'user_preferences'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%user_id%'
  ) THEN
    ALTER TABLE user_preferences
      ADD CONSTRAINT fk_user_preferences_user
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE POLICY "Users can read own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- topic_overviews RLS
-- ============================================================

-- Drop permissive policy
DROP POLICY IF EXISTS "Allow all operations on topic_overviews" ON topic_overviews;

-- Add user_id to topic_overviews for per-user caching
ALTER TABLE topic_overviews
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old unique constraint on topic_name alone and add per-user one
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'topic_overviews'
    AND constraint_type = 'UNIQUE'
    AND constraint_name LIKE '%topic_name%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE topic_overviews DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'topic_overviews'
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%topic_name%'
      LIMIT 1
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_overviews_user_topic
  ON topic_overviews(user_id, topic_name);

CREATE POLICY "Users can read own topic_overviews" ON topic_overviews
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own topic_overviews" ON topic_overviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own topic_overviews" ON topic_overviews
  FOR UPDATE USING (auth.uid() = user_id);
