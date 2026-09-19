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

import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { config } from '../config.js';
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

// ── Provider connection credential vault ───────────────────────────────
//
// Provider API keys (provider_connections.encrypted_key) are encrypted at
// rest with AES-256-GCM. The vault key is `config.encryptionKey` (the
// ENCRYPTION_KEY env var; a dev-only fallback outside production — see
// productionReadiness.ts). It never falls back to OPENAI_API_KEY: rotating
// or leaking the provider key would silently corrupt every stored
// credential. The raw key is NEVER returned in API responses — only the
// masked form.

const PROVIDER_VAULT_KEY_BYTES = createHash('sha256')
  .update(config.encryptionKey)
  .digest()
  .slice(0, 32);

export function encryptApiKey(apiKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', PROVIDER_VAULT_KEY_BYTES, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptApiKey(encryptedKey: string): string {
  const buf = Buffer.from(encryptedKey, 'base64');
  const iv = buf.slice(0, 12);
  const authTag = buf.slice(12, 28);
  const ciphertext = buf.slice(28);
  const decipher = createDecipheriv('aes-256-gcm', PROVIDER_VAULT_KEY_BYTES, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••';
  return key.slice(0, 3) + '••••' + key.slice(-4);
}
