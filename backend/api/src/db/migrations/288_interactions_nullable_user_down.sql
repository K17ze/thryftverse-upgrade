-- 288_interactions_nullable_user_down.sql

-- Restore NOT NULL. Any anonymous (NULL user_id) rows must be removed
-- first or the ALTER fails.
DELETE FROM interactions WHERE user_id IS NULL;

ALTER TABLE interactions
  ALTER COLUMN user_id SET NOT NULL;
