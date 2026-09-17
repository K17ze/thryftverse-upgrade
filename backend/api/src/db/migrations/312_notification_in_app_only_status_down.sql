-- Down migration for 312_notification_in_app_only_status.
-- Reverts in_app_only rows back to suppressed so the restored CHECK passes.

UPDATE notification_events
   SET status = 'suppressed',
       suppression_reason = COALESCE(suppression_reason, 'unmapped_event_type')
 WHERE status = 'in_app_only';

ALTER TABLE notification_events
  DROP CONSTRAINT IF EXISTS notification_events_status_check;

ALTER TABLE notification_events
  ADD CONSTRAINT notification_events_status_check
  CHECK (status IN ('queued', 'ticketed', 'sent', 'suppressed', 'failed'));
