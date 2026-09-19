import test from 'node:test';
import assert from 'node:assert/strict';

import { attributeSignupToReferralCode, ensureReferralCode } from '../lib/referrals.js';

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };

function fakeDb(
  handler: (text: string, params: unknown[]) => QueryResult,
  queries: { text: string; params: unknown[] }[] = [],
) {
  return {
    queries,
    query: async (text: string, params: unknown[] = []) => {
      queries.push({ text, params });
      return handler(text, params);
    },
  };
}

test('ensureReferralCode returns the existing code without inserting', async () => {
  const db = fakeDb((text) => {
    if (text.includes('FROM user_referral_codes')) {
      return { rows: [{ code: 'TV-EXISTING' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const code = await ensureReferralCode(db as never, 'user_1');
  assert.equal(code, 'TV-EXISTING');
  assert.equal(db.queries.length, 1);
});

test('ensureReferralCode inserts a TV- code when none exists', async () => {
  const db = fakeDb((text) => {
    if (text.includes('FROM user_referral_codes')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('INSERT INTO user_referral_codes')) {
      return { rows: [{ code: 'TV-ABC123' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const code = await ensureReferralCode(db as never, 'user_1');
  assert.equal(code, 'TV-ABC123');
});

test('ensureReferralCode reuses the winner code after a user_id race', async () => {
  let insertCalls = 0;
  const db = fakeDb((text) => {
    if (text.includes('INSERT INTO user_referral_codes')) {
      insertCalls += 1;
      return { rows: [], rowCount: 0 }; // ON CONFLICT DO NOTHING → loser
    }
    if (text.includes('FROM user_referral_codes')) {
      return insertCalls > 0
        ? { rows: [{ code: 'TV-WINNER1' }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });

  const code = await ensureReferralCode(db as never, 'user_1');
  assert.equal(code, 'TV-WINNER1');
});

test('attributeSignupToReferralCode ignores unknown codes', async () => {
  const db = fakeDb((text) => {
    if (text.includes('FROM user_referral_codes')) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await attributeSignupToReferralCode(db as never, {
    referredUserId: 'user_new',
    referralCode: 'TV-NOPE',
  });
  assert.equal(result, null);
  assert.equal(db.queries.length, 1); // owner lookup only — no insert attempted
});

test('attributeSignupToReferralCode blocks self-referral', async () => {
  const db = fakeDb((text) => {
    if (text.includes('FROM user_referral_codes')) {
      return { rows: [{ user_id: 'user_new' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await attributeSignupToReferralCode(db as never, {
    referredUserId: 'user_new',
    referralCode: 'TV-SELF',
  });
  assert.equal(result, null);
  assert.equal(db.queries.length, 1);
});

test('attributeSignupToReferralCode records attribution and normalizes the code', async () => {
  const db = fakeDb((text) => {
    if (text.includes('FROM user_referral_codes')) {
      return { rows: [{ user_id: 'referrer_1' }], rowCount: 1 };
    }
    if (text.includes('INSERT INTO user_referral_attributions')) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await attributeSignupToReferralCode(db as never, {
    referredUserId: 'user_new',
    referralCode: '  tv-abc123  ',
  });
  assert.equal(result, 'referrer_1');
  const insert = db.queries.find((q) => q.text.includes('INSERT INTO user_referral_attributions'));
  assert.ok(insert);
  assert.equal(insert!.params[1], 'TV-ABC123');
});

test('attributeSignupToReferralCode dedupes a second attribution for the same user', async () => {
  const db = fakeDb((text) => {
    if (text.includes('FROM user_referral_codes')) {
      return { rows: [{ user_id: 'referrer_1' }], rowCount: 1 };
    }
    if (text.includes('INSERT INTO user_referral_attributions')) {
      return { rows: [], rowCount: 0 }; // ON CONFLICT (referred_user_id) DO NOTHING
    }
    return { rows: [], rowCount: 0 };
  });

  const result = await attributeSignupToReferralCode(db as never, {
    referredUserId: 'user_new',
    referralCode: 'TV-ABC123',
  });
  assert.equal(result, null);
});

test('attributeSignupToReferralCode no-ops without a code', async () => {
  const db = fakeDb(() => ({ rows: [], rowCount: 0 }));
  assert.equal(await attributeSignupToReferralCode(db as never, { referredUserId: 'u' }), null);
  assert.equal(await attributeSignupToReferralCode(db as never, { referredUserId: 'u', referralCode: '   ' }), null);
  assert.equal(db.queries.length, 0);
});
