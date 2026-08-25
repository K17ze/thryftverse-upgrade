# Chat Security Model

## Transport

- All API traffic is encrypted in transit using TLS 1.2+.
- The realtime event bus (LISTEN/NOTIFY over Postgres, fanned out via WebSocket) operates over the same TLS-terminated connection.

## At Rest

- Message bodies, metadata, and attachments are stored in Postgres with transparent encryption at the storage layer.
- Column-level encryption is applied to `secure_messages.ciphertext` via a KMS-backed key service (`keyService.ts`), using envelope encryption with authenticated associated data (AAD).
- Media assets are stored in object storage with server-side encryption (SSE) backed by KMS.

## Access Control

- Every chat route calls `ensureChatConversationAccess` which verifies that the authenticated user is a member of the conversation via `chat_members`.
- Group management operations require owner or admin role via `ensureGroupManagementAccess`.
- Row-level security policies (migration 121) provide database-level defence-in-depth on conversation-scoped tables.

## Request Gates

- New DM conversations may create a message request with `request_status = 'pending'` for the recipient if their privacy settings require it.
- The message send route (`POST /chat/conversations/:conversationId/messages`) checks the actor's `request_status` from `chat_conversation_user_state`. If the status is `'pending'` or `'declined'`, the route returns 403 with `{ error: 'Message request has not been accepted' }`.
- Only `'accepted'` or null (legacy conversations) request status allows sending.

## Read Receipts

- Read receipts are opt-in via the `read_receipts_enabled` boolean column on `users` (migration 106).
- The mark-read route (`POST /chat/conversations/:conversationId/read`) always updates `chat_members.last_read_at` for the actor, but only publishes the `chat.message.read` realtime event if the actor's `read_receipts_enabled` is true.
- Per-message read state is tracked in `chat_message_read_receipts` (migration 149).

## Delete

- **Delete-for-me**: Per-user tombstone recorded in `chat_message_deletions` (migration 149). Message list queries exclude messages where a tombstone exists for the requesting user via `NOT EXISTS` subquery.
- **Delete-for-everyone**: Sets `deleted_for_everyone_at` on `chat_messages`. Restricted to the sender within a 24-hour window. Message list queries filter `deleted_for_everyone_at IS NULL`.

## Media

- Media URIs in messages are validated server-side against the `media_assets` table.
- The message send route queries `media_assets` by canonical URL and verifies `owner_id` matches the sender. If the asset is not found or not owned by the sender, the route returns 403.
- A row is written to `chat_message_attachments` (migration 149) binding the message to the media asset with a foreign key, so recipients and second devices can resolve the media.
- Only finalized, published media assets should be referenced; the ownership check enforces that the sender controls the asset.

## Not End-to-End Encrypted

ThryftVerse chat is **not** E2EE. Messages are encrypted in transit (TLS) and at rest (storage-level + KMS for secure messages), but the server can read message content for moderation, search, and abuse detection. Do not claim or imply end-to-end encryption.
