-- Migration 006: Cleanup duplicate calendar_event_links (cross-workspace dedup)
-- Run this BEFORE deploying the updated Edge Function

-- 1. Find duplicates
SELECT action_id, COUNT(*) as cnt, array_agg(id) as link_ids
FROM calendar_event_links
GROUP BY action_id
HAVING COUNT(*) > 1;

-- 2. Keep only the OLDEST link per action_id, delete the rest
DELETE FROM calendar_event_links
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY action_id ORDER BY created_at ASC) as rn
    FROM calendar_event_links
  ) ranked
  WHERE rn > 1
);

-- 3. Reset sync_status for all actions so they re-sync with the fixed dedup logic
UPDATE actions SET sync_status = 'not_synced'
WHERE id IN (
  SELECT DISTINCT action_id FROM calendar_sync_queue WHERE status = 'pending'
);

-- Verify: no more duplicates
SELECT action_id, COUNT(*) as cnt
FROM calendar_event_links
GROUP BY action_id
HAVING COUNT(*) > 1;
