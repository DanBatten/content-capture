-- Rename "Social Media" topic to "Commentary" in existing content
-- This aligns with the updated categorization that focuses on content value over platform

UPDATE content_items
SET
  topics = array_replace(topics, 'Social Media', 'Commentary'),
  updated_at = NOW()
WHERE 'Social Media' = ANY(topics);

-- Log how many items were updated
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % items from "Social Media" to "Commentary"', updated_count;
END $$;
