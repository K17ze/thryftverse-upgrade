/**
 * userErasure — regression coverage for erasure-completeness gaps.
 *
 * R85: `media_embeddings` rows (migration 145 — model-versioned vectors
 * keyed by media_asset_id) survived erasure because the FK cascade on
 * media_assets only fires on hard delete, and erasure soft-deletes the
 * assets. The routine must delete the user's embeddings explicitly,
 * scoped through the owning media_assets rows.
 *
 * Infra-free: performUserErasure is driven against a recording fake
 * client; every query returns an empty result, which is valid for all of
 * the routine's statements.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { performUserErasure } from '../lib/userErasure.js';

function fakeClient() {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const query = async <T = unknown>(text: string, params?: unknown[]) => {
    calls.push({ text, params });
    return { rows: [], rowCount: 0 } as { rows: T[]; rowCount: number };
  };
  return { calls, query };
}

test('erasure deletes media_embeddings rows owned via the user\'s media assets', async () => {
  const { calls, query } = fakeClient();
  const client = { query } as unknown as Parameters<typeof performUserErasure>[0];

  await performUserErasure(client, 'user_1', 'gdpr');

  const normalized = calls.map((c) => c.text.replace(/\s+/g, ' '));
  const embeddingsDelete = normalized.findIndex((t) =>
    t.includes('DELETE FROM media_embeddings'),
  );
  assert.ok(
    embeddingsDelete !== -1,
    'media_embeddings rows must be deleted — the media_assets FK cascade never fires on soft delete',
  );

  const statement = normalized[embeddingsDelete];
  // Scoped through the asset owner, not a user_id column the table lacks.
  assert.ok(
    statement.includes('SELECT id FROM media_assets WHERE owner_id = $1'),
    'deletion must be scoped to the user\'s media assets via owner_id',
  );
  assert.deepEqual(calls[embeddingsDelete].params, ['user_1']);

  // Children are removed before the parent assets are soft-deleted, so a
  // partially-failed transaction never orphans embeddings on a 'deleted'
  // asset.
  const assetsUpdate = normalized.findIndex((t) =>
    t.includes('UPDATE media_assets'),
  );
  assert.ok(assetsUpdate !== -1, 'media_assets soft-delete missing');
  assert.ok(
    embeddingsDelete < assetsUpdate,
    'media_embeddings must be deleted before the media_assets soft-delete',
  );
});
