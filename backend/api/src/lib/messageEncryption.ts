/**
 * Message body encryption helper.
 *
 * Wraps the key service (`keyService.ts`) to provide a simple encrypt/decrypt
 * API for chat and support message bodies. Uses the 'message' key namespace
 * with the message ID as additional authenticated data (AAD) to bind
 * ciphertext to a specific message.
 *
 * Design principles:
 * - **AAD binding.** The message ID is used as AAD so that a ciphertext
 *   cannot be swapped between messages (authenticated encryption).
 * - **Graceful degradation.** If the key service is unavailable, encryption
 *   fails closed (the caller must handle the error) and decryption falls
 *   back to the plaintext `body` column for un-migrated rows.
 * - **Batch-friendly.** The backfill worker uses `encryptMessageBody` in a
 *   loop with a configurable batch size.
 */

import { encryptJsonPayload, decryptJsonPayload } from './keyService.js';
import { logger } from './logger.js';

/**
 * Encrypt a message body for storage in `body_ciphertext`.
 *
 * @param messageId — The message ID, used as AAD to bind ciphertext to the row.
 * @param body — The plaintext message body.
 * @returns The ciphertext and key version to store.
 */
export async function encryptMessageBody(
  messageId: string,
  body: string,
): Promise<{ ciphertext: string; keyVersion: number }> {
  const result = await encryptJsonPayload('message', { body }, `msg:${messageId}`);
  return {
    ciphertext: result.ciphertext,
    keyVersion: result.keyVersion,
  };
}

/**
 * Decrypt a message body from stored ciphertext.
 *
 * @param messageId — The message ID (must match the one used for encryption).
 * @param ciphertext — The stored ciphertext.
 * @returns The plaintext message body.
 */
export async function decryptMessageBody(
  messageId: string,
  ciphertext: string,
): Promise<string> {
  const payload = await decryptJsonPayload<{ body: string }>(
    ciphertext,
    `msg:${messageId}`,
  );
  return payload.body;
}

/**
 * Resolve the effective body for a message row, handling the dual-write
 * migration period.
 *
 * - If `bodyCiphertext` is non-null, decrypt it via the key service.
 * - If `bodyCiphertext` is null, return the plaintext `body` (un-migrated row).
 *
 * This function never throws — if decryption fails, it returns the plaintext
 * `body` as a fallback and logs the error. This ensures the chat system
 * remains functional even if the key service is temporarily unavailable.
 */
export async function resolveMessageBody(
  messageId: string,
  body: string,
  bodyCiphertext: string | null,
): Promise<string> {
  if (!bodyCiphertext) {
    return body;
  }

  try {
    return await decryptMessageBody(messageId, bodyCiphertext);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { messageId, err: message },
      'messageEncryption.decryptFailed',
    );
    // Fall back to plaintext body. This may be `[encrypted]` for migrated
    // rows, but it's better than throwing and breaking the chat UI.
    return body;
  }
}
