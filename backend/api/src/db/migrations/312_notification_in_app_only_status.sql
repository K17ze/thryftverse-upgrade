-- 312: notification_events.status gains 'in_app_only'.
--
-- Previously, push-ineligible event types (mapEventToPushCategory → null)
-- were written with status='suppressed', which the feed, filter counts and
-- unread-count queries all exclude — in-app-only events were invisible
-- everywhere. 'in_app_only' keeps the event feed-visible while recording
-- that no push was ever queued.

ALTER TABLE notification_events
  DROP CONSTRAINT IF EXISTS notification_events_status_check;

ALTER TABLE notification_events
  ADD CONSTRAINT notification_events_status_check
  CHECK (status IN ('queued', 'ticketed', 'sent', 'suppressed', 'failed', 'in_app_only'));

-- Repair: events suppressed solely for being unmapped become feed-visible.
UPDATE notification_events
   SET status = 'in_app_only'
 WHERE status = 'suppressed'
   AND suppression_reason = 'unmapped_event_type';
