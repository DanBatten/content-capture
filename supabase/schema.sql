-- Content Capture Database Schema
-- Run this in your Supabase SQL editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main content items table
CREATE TABLE content_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_url TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('twitter', 'instagram', 'linkedin', 'pinterest', 'web')),

  -- Extracted content
  title TEXT,
  description TEXT,
  body_text TEXT,
  author_name TEXT,
  author_handle TEXT,
  published_at TIMESTAMPTZ,

  -- Media (JSONB arrays)
  images JSONB DEFAULT '[]'::jsonb,
  videos JSONB DEFAULT '[]'::jsonb,

  -- AI Analysis
  summary TEXT,
  topics TEXT[] DEFAULT '{}',
  disciplines TEXT[] DEFAULT '{}',
  use_cases TEXT[] DEFAULT '{}',
  content_type TEXT CHECK (content_type IN ('post', 'article', 'thread', 'image', 'video')),

  -- Platform-specific metadata
  platform_data JSONB,

  -- Notion sync
  notion_page_id TEXT,
  notion_synced_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  error_message TEXT,

  -- Timestamps
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_content_source_type ON content_items(source_type);
CREATE INDEX idx_content_topics ON content_items USING GIN(topics);
CREATE INDEX idx_content_disciplines ON content_items USING GIN(disciplines);
CREATE INDEX idx_content_use_cases ON content_items USING GIN(use_cases);
CREATE INDEX idx_content_captured_at ON content_items(captured_at DESC);
CREATE INDEX idx_content_status ON content_items(status);
CREATE INDEX idx_content_notion_page ON content_items(notion_page_id) WHERE notion_page_id IS NOT NULL;

-- Full-text search index
CREATE INDEX idx_content_search ON content_items USING GIN(
  to_tsvector('english',
    COALESCE(title, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(body_text, '') || ' ' ||
    COALESCE(summary, '')
  )
);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_content_items_updated_at
    BEFORE UPDATE ON content_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (single user)
-- In production, you'd want to add user_id and proper policies
CREATE POLICY "Allow all operations" ON content_items
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Optional: Function to search content
CREATE OR REPLACE FUNCTION search_content(search_query TEXT, limit_count INT DEFAULT 20)
RETURNS SETOF content_items AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM content_items
  WHERE to_tsvector('english',
    COALESCE(title, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(body_text, '') || ' ' ||
    COALESCE(summary, '')
  ) @@ plainto_tsquery('english', search_query)
  ORDER BY captured_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
