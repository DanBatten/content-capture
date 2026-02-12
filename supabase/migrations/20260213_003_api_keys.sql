-- Migration 003: Personal API Keys with scopes
-- Allows users to create API keys for Chrome extension and external tools

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL, -- First 8 chars for display (e.g., "ak_3f2a...")
  name TEXT NOT NULL DEFAULT 'Default',
  scopes TEXT[] NOT NULL DEFAULT '{capture,read}',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Fast lookup by key hash (only non-revoked keys)
CREATE INDEX IF NOT EXISTS idx_api_keys_hash_active
  ON api_keys(key_hash) WHERE revoked_at IS NULL;

-- List user's keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user
  ON api_keys(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can manage their own keys
CREATE POLICY "Users can read own keys" ON api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own keys" ON api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own keys" ON api_keys
  FOR UPDATE USING (auth.uid() = user_id);

COMMENT ON TABLE api_keys IS 'Personal API keys with scopes for Chrome extension and external tools';
COMMENT ON COLUMN api_keys.scopes IS 'Allowed scopes: capture (write), read (search/items), chat (AI features, Pro only)';
