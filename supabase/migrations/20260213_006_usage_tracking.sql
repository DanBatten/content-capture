-- Migration 006: Usage Tracking
-- Tracks per-user daily usage for rate limiting

CREATE TABLE IF NOT EXISTS usage_tracking (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INT NOT NULL DEFAULT 0,
  token_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint, date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_date
  ON usage_tracking(user_id, endpoint, date);

-- Enable RLS
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage
CREATE POLICY "Users can read own usage" ON usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

-- Atomic upsert function for tracking usage
CREATE OR REPLACE FUNCTION track_usage(
  p_user_id UUID,
  p_endpoint TEXT,
  p_tokens INT DEFAULT 0
)
RETURNS void AS $$
BEGIN
  INSERT INTO usage_tracking (user_id, endpoint, date, request_count, token_count)
  VALUES (p_user_id, p_endpoint, CURRENT_DATE, 1, p_tokens)
  ON CONFLICT (user_id, endpoint, date)
  DO UPDATE SET
    request_count = usage_tracking.request_count + 1,
    token_count = usage_tracking.token_count + p_tokens;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE usage_tracking IS 'Per-user daily usage counters for rate limiting';
COMMENT ON FUNCTION track_usage IS 'Atomic increment of usage counters';
