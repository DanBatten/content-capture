-- Migration 007: Webhook Event Log
-- Idempotency table for Stripe webhook deduplication

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at
  ON processed_webhook_events(processed_at);

-- Cleanup function: delete events older than 30 days
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events()
RETURNS void AS $$
BEGIN
  DELETE FROM processed_webhook_events
  WHERE processed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE processed_webhook_events IS 'Idempotency log for Stripe webhook deduplication';
COMMENT ON FUNCTION cleanup_old_webhook_events IS 'Removes webhook events older than 30 days';
