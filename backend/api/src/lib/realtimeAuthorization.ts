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
