import { randomBytes } from 'node:crypto';

type DbQueryable = {
  query: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }>;
};

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateReferralCode(): string {
  const bytes = randomBytes(6);
  let suffix = '';
  for (const byte of bytes) {
    suffix += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return `TV-${suffix}`;
}

/**
 * Get-or-create the user's server-owned referral code. Codes are durable
 * (a shared link keeps working) and unique; collisions retry a few times
 * then let the caller surface a 500 rather than mint a duplicate.
 */
export async function ensureReferralCode(
  db: DbQueryable,
  userId: string,
): Promise<string> {
  const existing = await db.query<{ code: string }>(
    `SELECT code FROM user_referral_codes WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (existing.rows[0]) return existing.rows[0].code;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = generateReferralCode();
    try {
      const inserted = await db.query<{ code: string }>(
        `INSERT INTO user_referral_codes (user_id, code)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING code`,
        [userId, code],
      );
      if (inserted.rows[0]) return inserted.rows[0].code;
      // Lost the user_id race — the winner's code is durable, reuse it.
      const winner = await db.query<{ code: string }>(
        `SELECT code FROM user_referral_codes WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      if (winner.rows[0]) return winner.rows[0].code;
    } catch (error) {
      // 23505 on the code column — generate a fresh suffix and retry.
      if ((error as { code?: string }).code === '23505') continue;
      throw error;
    }
  }
  throw new Error('Unable to allocate a referral code');
}

/**
 * Attribute a new signup to a referral code. Best-effort: unknown codes,
 * self-referrals and duplicate attributions are ignored rather than
 * blocking signup. Returns the referrer's user id when attributed.
 */
export async function attributeSignupToReferralCode(
  db: DbQueryable,
  input: { referredUserId: string; referralCode?: string | null },
): Promise<string | null> {
  const code = input.referralCode?.trim().toUpperCase();
  if (!code) return null;

  const owner = await db.query<{ user_id: string }>(
    `SELECT user_id FROM user_referral_codes WHERE code = $1 LIMIT 1`,
    [code],
  );
  const referrerUserId = owner.rows[0]?.user_id;
  if (!referrerUserId || referrerUserId === input.referredUserId) {
    return null;
  }

  const attribution = await db.query(
    `INSERT INTO user_referral_attributions (id, code, referrer_user_id, referred_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (referred_user_id) DO NOTHING`,
    [`ref_${randomBytes(12).toString('hex')}`, code, referrerUserId, input.referredUserId],
  );
  return attribution.rowCount ? referrerUserId : null;
}
