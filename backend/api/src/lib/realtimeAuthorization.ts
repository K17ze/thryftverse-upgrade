type DbQueryable = {
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

export function isPublicRealtimeTopic(topic: string): boolean {
  const normalized = normalizeTopic(topic);
  return normalized === 'auctions.market'
    || /^auction:[a-z0-9_-]{2,160}$/.test(normalized)
    || /^co-own\.asset:[a-z0-9_-]{2,160}$/.test(normalized);
}

export async function canUserSubscribeToRealtimeTopic(
  client: DbQueryable,
  userId: string,
  topic: string
): Promise<boolean> {
  const normalized = normalizeTopic(topic);

  if (!normalized || normalized === '*' || normalized.length > 240) {
    return false;
  }

  if (isPublicRealtimeTopic(normalized)) {
    return true;
  }

  if (normalized.startsWith('notifications.user:')) {
    return normalized === `notifications.user:${userId.toLowerCase()}`;
  }

  // Dyad presence topics (`presence.user:{userId}`) carry online/offline
  // transitions for a user. A user may always subscribe to their own topic;
  // anyone else must share a DM channel with the target so presence is only
  // exposed to direct conversation peers.
  const presenceMatch = normalized.match(/^presence\.user:([a-z0-9_-]{2,160})$/);
  if (presenceMatch) {
    const targetUserId = presenceMatch[1];
    if (targetUserId === userId.toLowerCase()) {
      return true;
    }

    const presenceResult = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM chat_members viewer
          INNER JOIN chat_members peer
            ON peer.conversation_id = viewer.conversation_id
          INNER JOIN chat_conversations c
            ON c.id = viewer.conversation_id
          WHERE viewer.user_id = $1
            AND peer.user_id = $2
            AND c.type = 'dm'
          UNION ALL
          SELECT 1
          FROM secure_messages
          WHERE (sender_id = $1 AND recipient_id = $2)
             OR (sender_id = $2 AND recipient_id = $1)
        ) AS allowed
      `,
      [userId, targetUserId]
    );

    const presenceRow = presenceResult.rows[0] as { allowed?: unknown } | undefined;
    return Boolean(presenceRow?.allowed);
  }

  // Live-shopping session topics (`live.session:{sessionId}`) carry chat,
  // bids, lot lifecycle and viewer-count events for an active broadcast.
  // None of these are secret — any authenticated user may subscribe while
  // the session is live or ending. Pre-live states (draft/backstage) are
  // host-only: the seller subscribes for lot/chat events before going live
  // without exposing the session to viewers. Without this branch every
  // live subscription fell through to `false` and the whole live fan-out
  // was silently dead.
  const liveSessionMatch = normalized.match(/^live\.session:([a-z0-9_-]{2,160})$/);
  if (liveSessionMatch) {
    const sessionId = liveSessionMatch[1];
    const sessionResult = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM live_shopping_sessions
          WHERE id = $1
            AND status NOT IN ('ended', 'failed')
            AND (
              status IN ('live', 'ending')
              OR host_user_id = $2
            )
        ) AS allowed
      `,
      [sessionId, userId]
    );
    const sessionRow = sessionResult.rows[0] as { allowed?: unknown } | undefined;
    return Boolean(sessionRow?.allowed);
  }

  const chatMatch = normalized.match(/^chat\.conversation:([a-z0-9_-]{2,160})$/);
  if (!chatMatch) {
    return false;
  }

  const conversationId = chatMatch[1];
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM chat_members
        WHERE conversation_id = $1
          AND user_id = $2
        UNION ALL
        SELECT 1
        FROM secure_messages
        WHERE conversation_id = $1
          AND (sender_id = $2 OR recipient_id = $2)
      ) AS allowed
    `,
    [conversationId, userId]
  );

  const firstRow = result.rows[0] as { allowed?: unknown } | undefined;
  return Boolean(firstRow?.allowed);
}
