-- Migration: Content Links
-- Table for tracking URLs extracted from content and their capture status

CREATE TABLE IF NOT EXISTS content_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Source content that contained the link
  source_content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,

  -- Target content (if we've captured the linked URL)
  target_content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,

  -- The extracted URL
  url TEXT NOT NULL,

  -- Type of link: 'embedded' (in tweet text), 'mentioned' (referenced)
  link_type TEXT NOT NULL CHECK (link_type IN ('embedded', 'mentioned', 'quote')),

  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed', 'skipped')),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  -- Prevent duplicate links from same source
  UNIQUE(source_content_id, url)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_content_links_source ON content_links(source_content_id);
CREATE INDEX IF NOT EXISTS idx_content_links_target ON content_links(target_content_id) WHERE target_content_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_links_status ON content_links(status);
CREATE INDEX IF NOT EXISTS idx_content_links_url ON content_links(url);

-- Row Level Security
ALTER TABLE content_links ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single user for now)
CREATE POLICY "Allow all operations on content_links" ON content_links
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE content_links IS 'Tracks URLs extracted from captured content';
COMMENT ON COLUMN content_links.link_type IS 'embedded = in body text, mentioned = referenced, quote = quoted content';
COMMENT ON COLUMN content_links.status IS 'pending = not yet processed, processing = in queue, complete = captured, failed = error, skipped = filtered out';
