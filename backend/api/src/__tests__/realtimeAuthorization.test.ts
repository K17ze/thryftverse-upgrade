import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canUserSubscribeToRealtimeTopic,
  isPublicRealtimeTopic,
} from '../lib/realtimeAuthorization.js';

test('realtime authorization permits market topics and rejects wildcard access', async () => {
  const db = {
    query: async () => ({ rows: [{ allowed: false }] }),
  };

  assert.equal(isPublicRealtimeTopic('auctions.market'), true);
  assert.equal(isPublicRealtimeTopic('auction:auction_1'), true);
  assert.equal(isPublicRealtimeTopic('co-own.asset:asset_1'), true);
  assert.equal(await canUserSubscribeToRealtimeTopic(db, 'user_1', '*'), false);
});

test('realtime authorization restricts notification topics to their owner', async () => {
  const db = {
    query: async () => ({ rows: [{ allowed: false }] }),
  };

  assert.equal(
    await canUserSubscribeToRealtimeTopic(db, 'user_1', 'notifications.user:user_1'),
    true
  );
  assert.equal(
    await canUserSubscribeToRealtimeTopic(db, 'user_1', 'notifications.user:user_2'),
    false
  );
});

test('realtime authorization resolves chat membership through the database', async () => {
  const seen: unknown[][] = [];
  const db = {
    query: async (_text: string, params?: unknown[]) => {
      seen.push(params ?? []);
      return { rows: [{ allowed: true }] };
    },
  };

  assert.equal(
    await canUserSubscribeToRealtimeTopic(db, 'user_1', 'chat.conversation:conv_1'),
    true
  );
  assert.deepEqual(seen, [['conv_1', 'user_1']]);
});

test('realtime authorization allows live session topics for authenticated viewers', async () => {
  const seen: { text: string; params: unknown[] }[] = [];
  const db = {
    query: async (text: string, params?: unknown[]) => {
      seen.push({ text, params: params ?? [] });
      return { rows: [{ allowed: true }] };
    },
  };

  assert.equal(
    await canUserSubscribeToRealtimeTopic(db, 'viewer_1', 'live.session:stream_1'),
    true
  );
  // The session lookup scopes to the session id AND the subscriber (host
  // fallback for pre-live states) — both params must reach the query.
  assert.deepEqual(seen[0]?.params, ['stream_1', 'viewer_1']);
});

test('realtime authorization rejects live session topics for ended or missing sessions', async () => {
  const db = {
    query: async () => ({ rows: [{ allowed: false }] }),
  };

  assert.equal(
    await canUserSubscribeToRealtimeTopic(db, 'viewer_1', 'live.session:stream_ended'),
    false
  );
});
