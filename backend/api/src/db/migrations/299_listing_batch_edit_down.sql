-- 299 down: drop the per-item receipt detail column added for the batch
-- 'edit' command. Replays of edit batches will lose the applied-field list
-- but remain status-truthful.

ALTER TABLE listing_batch_items
  DROP COLUMN IF EXISTS detail;
