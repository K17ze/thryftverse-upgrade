/**
 * Referral-code capture — the /invite/[code] landing persists the shared
 * code here; signup consumes it (POST /auth/signup accepts `referralCode`
 * and attributes best-effort server-side).
 *
 * localStorage, not sessionStorage: a recipient who opens the link,
 * browses and returns in another tab or days later must still attribute —
 * the code survives until a signup consumes it.
 */

export const REFERRAL_CODE_STORAGE_KEY = 'thryftverse.referral-code';

/**
 * Server-issued codes are `TV-XXXXXX` today. The capture accepts the
 * signup schema's bounds (4–32 chars, alnum + internal hyphens) rather
 * than the generator's exact shape so older/newer formats still
 * attribute — the server validates the code itself at attribution.
 */
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{2,30}[A-Za-z0-9]$/;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Validate + persist a code from a shared link. Returns the normalised
 *  code, or null when the segment isn't a plausible code (nothing
 *  stored — a garbage segment must not shadow a real captured code). */
export function captureReferralCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return null;
  try {
    storage()?.setItem(REFERRAL_CODE_STORAGE_KEY, code);
  } catch {
    // Storage unavailable (private mode) — the in-page signup hand-off
    // still works for this navigation; persistence is best-effort.
  }
  return code;
}

/** The pending captured code, if any. */
export function peekReferralCode(): string | null {
  try {
    return storage()?.getItem(REFERRAL_CODE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Clear after a successful signup — attribution is one-shot. */
export function clearReferralCode(): void {
  try {
    storage()?.removeItem(REFERRAL_CODE_STORAGE_KEY);
  } catch {
    // best-effort
  }
}
