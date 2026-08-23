-- Posters are first-class publication targets. The media_bindings
-- target_type CHECK constraint (migration 074, extended in 129 for
-- 'look') must include 'poster' so poster media can be bound
-- authoritatively, matching the pattern used for looks.

ALTER TABLE media_bindings
  DROP CONSTRAINT IF EXISTS media_bindings_target_type_check;

ALTER TABLE media_bindings
  ADD CONSTRAINT media_bindings_target_type_check
  CHECK (target_type IN (
    'listing',
    'auction',
    'profile',
    'creator_document',
    'look',
    'poster',
    'chat_message',
    'review',
    'support_ticket'
  ));
