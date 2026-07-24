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
