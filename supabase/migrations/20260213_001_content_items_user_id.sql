-- Migration 001: Add user_id to content_items
-- Enables per-user data isolation for multi-user support

BEGIN;

-- Add nullable user_id column (nullable during migration period)
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for efficient per-user queries
CREATE INDEX IF NOT EXISTS idx_content_items_user_created
  ON content_items(user_id, created_at DESC);

-- Drop existing unique constraint on source_url (if it exists)
-- and replace with per-user unique constraint so two users can save the same URL
DO $$
BEGIN
  -- Drop any existing unique constraint/index on source_url alone
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'content_items'
    AND indexdef LIKE '%UNIQUE%source_url%'
    AND indexdef NOT LIKE '%user_id%'
  ) THEN
    -- Find and drop the constraint
    EXECUTE (
      SELECT 'DROP INDEX IF EXISTS ' || indexname
      FROM pg_indexes
      WHERE tablename = 'content_items'
      AND indexdef LIKE '%UNIQUE%source_url%'
      AND indexdef NOT LIKE '%user_id%'
      LIMIT 1
    );
  END IF;

  -- Also drop named constraints
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'content_items'
    AND constraint_type = 'UNIQUE'
    AND constraint_name LIKE '%source_url%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE content_items DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'content_items'
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%source_url%'
      LIMIT 1
    );
  END IF;
END $$;

-- Create per-user unique constraint on source_url
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_items_user_source_url
  ON content_items(user_id, source_url);

COMMIT;

COMMENT ON COLUMN content_items.user_id IS 'Owner user ID - nullable during migration, will be set NOT NULL after backfill';
