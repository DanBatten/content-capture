-- Migration: Thread Support
-- Adds columns for tracking Twitter thread relationships

-- Parent reference (the tweet this one replies to)
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES content_items(id) ON DELETE SET NULL;

-- Thread root reference (the first tweet in a thread, for grouping)
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS thread_root_id UUID REFERENCES content_items(id) ON DELETE SET NULL;

-- Position within the thread (0 = root, 1 = first reply, etc.)
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS thread_position INTEGER DEFAULT 0;

-- Indexes for efficient thread queries
CREATE INDEX IF NOT EXISTS idx_content_thread_root ON content_items(thread_root_id) WHERE thread_root_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_parent ON content_items(parent_id) WHERE parent_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN content_items.parent_id IS 'Reference to the direct parent tweet (for replies)';
COMMENT ON COLUMN content_items.thread_root_id IS 'Reference to the first tweet in a thread (for grouping)';
COMMENT ON COLUMN content_items.thread_position IS 'Position within the thread (0 = root)';
