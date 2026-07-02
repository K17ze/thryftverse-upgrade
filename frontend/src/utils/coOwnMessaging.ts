import { createGroupConversationOnApi } from '../services/chatApi';
import type { Conversation } from '../data/mockData';

/**
 * Resolve or create a real backend conversation for Co-Own issuer messaging.
 *
 * This replaces the previous pattern of fabricating conversation IDs from
 * `${issuerId}_${listingId}`. The fabricated IDs did not exist on the backend,
 * so message sync and sending would silently fail.
 *
 * Uses the real `POST /chat/groups` endpoint with a deterministic idempotency
 * key so repeated attempts return the same conversation instead of duplicates.
 */
export async function resolveCoOwnConversation(
  currentUserId: string,
  issuerId: string,
  issuerHandle: string,
  listingId?: string,
): Promise<Conversation> {
  const idempotencyKey = `coown_dm_${currentUserId}_${issuerId}`;
  const title = `@${issuerHandle}`;

  return createGroupConversationOnApi({
    title,
    memberIds: [currentUserId, issuerId],
    itemId: listingId,
    idempotencyKey,
    description: 'Co-Own discussion',
  });
}
