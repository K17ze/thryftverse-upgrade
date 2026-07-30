-- Canonical DM participant-pair identity.
--
-- Application-level "find then insert" logic cannot prevent two concurrent
-- requests from creating duplicate direct conversations. A canonical pair key
-- makes DM creation semantically idempotent for the same two participants and
-- optional listing context.

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS dm_pair_key TEXT;

WITH member_pairs AS (
  SELECT
    conversation.id,
    conversation.item_id,
    ARRAY_AGG(member.user_id ORDER BY member.user_id) AS member_ids
  FROM chat_conversations conversation
  INNER JOIN chat_members member
    ON member.conversation_id = conversation.id
  WHERE conversation.type = 'dm'
  GROUP BY conversation.id, conversation.item_id
  HAVING COUNT(*) = 2
),
ranked_pairs AS (
  SELECT
    id,
    CONCAT_WS(
      CHR(31),
      member_ids[1],
      member_ids[2],
      COALESCE(item_id, '')
    ) AS pair_key,
    ROW_NUMBER() OVER (
      PARTITION BY
        member_ids[1],
        member_ids[2],
        item_id
      ORDER BY id
    ) AS duplicate_rank
  FROM member_pairs
)
UPDATE chat_conversations conversation
SET dm_pair_key = ranked_pairs.pair_key
FROM ranked_pairs
WHERE conversation.id = ranked_pairs.id
  AND ranked_pairs.duplicate_rank = 1
  AND conversation.dm_pair_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_dm_pair_key_idx
  ON chat_conversations (dm_pair_key)
  WHERE type = 'dm' AND dm_pair_key IS NOT NULL;

