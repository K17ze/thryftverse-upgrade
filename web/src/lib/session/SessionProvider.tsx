'use client';

/**
 * Session provider — supplies the current user identity and auth state.
 *
 * Two modes:
 *  - fixture: ships an authenticated demo user; guest toggle renders the
 *    signup-wall entry points like the mobile app.
 *  - live: hydrates the stored token session via `/users/me`, listens for
 *    the transport's session-expired event, and exposes real login/signup/
 *    logout against `/auth/*`.
 *
 * Identity integrity: every live identity transition — login, signup,
 * logout, session expiry, a different account resolving from a stored
 * token — runs `markSessionIdentity` and, when the owner actually changed,
 * `queryClient.clear()` + `resetAccountSlices()`. Unscoped query keys
 * (`['orders']`, `['my-listings']`, `['notifications']`…) and persisted
 * account slices (saved lists, follows, boards, drafts, payment overlays)
 * are account-owned truth; they must never survive into the next account.
 * Hydration reads capture the epoch at call time, so a resolution that
 * lands after a transition is dropped rather than written onto the new
 * session (identityEpoch.ts).
 *
 * Profile overlay: fixture mode only. In live mode the server is the only
 * truth for the self profile — the persisted overlay never merges (the
 * edit surface writes through PATCH /users/me instead), and it is wiped
 * with the other account slices on identity change.
 *
 * Verification: the persisted KYC outcome (components/verification store)
 * is merged into the session user in fixture mode — an approved demo
 * verification upgrades identityVerified/trustLevel so /profile and
 * /settings read one truth. In live mode the badge comes solely from
 * /users/me.
 *
 * Context split: the provider publishes TWO contexts so a high-frequency
 * stat can't re-render the whole app.
 *   - SessionIdentityContext — who you are and what you can do (user,
 *     isGuest, session lifecycle, verification). Changes only on real
 *     session transitions: login/logout/expiry, /users/me resolving, a
 *     fixture-mode profile save or KYC outcome.
 *   - SessionStatsContext — the live follows-store count. A follow tap
 *     rewrites `followingIds` on every action; folding it into the
 *     identity value meant every `useSession()` consumer re-rendered
 *     app-wide on each follow/unfollow.
 * `useSession()` keeps its exact public API — it subscribes to both
 * contexts and merges the live count onto `user.following`, so existing
 * consumers see zero behaviour change. Consumers that only need identity
 * (ids, avatars, guest gates — the overwhelming majority) should call
 * `useSessionIdentity()` and stay stable across stats churn.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@/lib/contracts/domain';
import { CURRENT_USER } from '@/lib/data/fixtures';
import { useHydrated } from '@/lib/store/useStore';
import { hydrateSavedLists } from '@/lib/store/useStore';
import { hydrateFollows, useFollows } from '@/lib/store/follows';
import { hydrateSavedSearches } from '@/lib/store/savedSearches';
import { useProfileEdit } from '@/lib/store/profileEdit';
import { useVerificationStore } from '@/components/verification/useVerificationStore';
import type {
  VerificationStatus,
  VerificationTier,
} from '@/components/verification/verificationModel';
import { DATA_MODE } from '@/lib/api/client';
import { SESSION_EXPIRED_EVENT } from '@/lib/api/http';
import * as authService from '@/lib/api/services/auth';
import type { AccountIdentity } from '@/lib/api/services/auth';
import { markSessionIdentity } from './identityEpoch';
import { resetAccountSlices } from './accountReset';

interface SessionValue {
  user: User | null;
  isGuest: boolean;
  /** True while live mode is resolving the stored session. */
  sessionLoading: boolean;
  /** Contact fields from /users/me (email, verification, phone) — the
      "Personal info" settings surface reads them. Live mode only; null
      while unresolved. */
  accountIdentity: AccountIdentity | null;
  /** Effective KYC status — the local submission wins, else the account's. */
  verificationStatus: VerificationStatus;
  /** Highest verification tier on the effective user. */
  verificationTier: VerificationTier;
  signIn: () => void;
  signOut: () => void;
  /** Real credential auth — no-op success in fixture mode. */
  login: (email: string, password: string) => Promise<void>;
  /** `referralCode` is the code captured from an /invite/[code] link —
   *  forwarded to POST /auth/signup for server-side attribution. */
  signup: (email: string, password: string, username: string, referralCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-pull /users/me after an account mutation (e.g. profile save). */
  refreshSession: () => Promise<void>;
}

/**
 * The identity context's value — the full session shape, with one honest
 * difference: `user.following` holds the account truth (fixture user /
 * /users/me), NOT the live follows-store count. The count is a stat —
 * read it through `useSessionStats()` or the merged `useSession()`.
 */
export interface SessionIdentityValue extends Omit<SessionValue, 'user'> {
  user: User | null;
}

export interface SessionStatsValue {
  /** Live follows-store count for the session user. `null` until
   *  persisted state hydrates — the account-truth `user.following`
   *  stands in before then, same gate the old single-context value had. */
  followingCount: number | null;
}

const SessionIdentityContext = createContext<SessionIdentityValue | null>(null);
const SessionStatsContext = createContext<SessionStatsValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const isLive = DATA_MODE === 'live';

  // Design-mode default: signed-in demo user, matching the mobile app's
  // fixture-design mode which renders authenticated surfaces. Live mode
  // starts neutral — guest until /users/me proves otherwise.
  const [isGuest, setIsGuest] = useState(isLive);
  const [liveUser, setLiveUser] = useState<User | null>(null);
  const [accountIdentity, setAccountIdentity] = useState<AccountIdentity | null>(null);
  const [sessionLoading, setSessionLoading] = useState(isLive);

  // SessionProvider sits inside QueryClientProvider (app/Providers.tsx), so
  // the cache can be wiped from here on identity changes.
  const queryClient = useQueryClient();

  /**
   * Adopt a resolved identity. Bumps the session epoch (vetoing any
   * hydration read that captured the previous one) and, when the account
   * actually changed, wipes the query cache and every persisted
   * account-owned slice BEFORE the new account's hydrations fire. Same
   * account on reload keeps its local slices — the hydrate re-arms them
   * with server truth anyway.
   *
   * Live mode only: fixture mode has exactly one account (the demo user);
   * its persisted slices are the design dataset, and the guest toggle is
   * a view state, not an identity change.
   */
  const adoptIdentity = useCallback(
    (userId: string | null) => {
      if (!isLive) return;
      const changed = markSessionIdentity(userId);
      if (changed) {
        queryClient.clear();
        resetAccountSlices();
      }
    },
    [isLive, queryClient],
  );

  // Persisted KYC outcome — hydration-gated so SSR and the first client
  // render agree before localStorage truth lands.
  const hydrated = useHydrated();
  const kycStatus = useVerificationStore((s) => s.status);
  const profileOverlay = useProfileEdit((s) => s.overlay);
  const followingCount = useFollows((s) => s.followingIds.length);

  const hydrateLiveSession = useCallback(async () => {
    try {
      const me = await authService.fetchMe();
      adoptIdentity(me.user?.id ?? null);
      setLiveUser(me.user);
      setAccountIdentity(me.account);
      setIsGuest(!me.user);
      if (me.user) {
        // Hydrations capture the epoch + user id at call time — a late
        // resolution after another identity transition is dropped.
        void hydrateSavedLists(me.user.id);
        void hydrateFollows(me.user.id);
        void hydrateSavedSearches(me.user.id);
      } else {
        // Resolved guest — a persisted set (e.g. fixture-mode seeds) would
        // mark strangers followed on a signed-out session. Clear it.
        useFollows.setState({ followingIds: [] });
      }
    } catch {
      // Network/server failure — keep whatever session state we have rather
      // than bouncing to guest on a transient outage. No identity was
      // resolved, so nothing is marked and nothing is wiped.
      setLiveUser(null);
      setAccountIdentity(null);
    } finally {
      setSessionLoading(false);
    }
  }, [adoptIdentity]);

  useEffect(() => {
    if (!isLive) return;
    void hydrateLiveSession();
    const onExpired = () => {
      // Expired = guest — drop the previous account's cache and persisted
      // slices synchronously, before any late hydration can land them.
      adoptIdentity(null);
      setLiveUser(null);
      setAccountIdentity(null);
      setIsGuest(true);
      useFollows.setState({ followingIds: [] });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [isLive, hydrateLiveSession, adoptIdentity]);

  const baseUser = isGuest ? null : isLive ? liveUser : CURRENT_USER;
  // Fixture KYC only: a persisted local 'approved' upgrades the demo
  // account. In live mode the badge comes solely from /users/me — a stale
  // localStorage approval must never mint it.
  const localApproved = !isLive && hydrated && kycStatus === 'approved';
  // Profile overlay — fixture mode only. Live mode reads /users/me as the
  // single truth; merging a persisted overlay would override the server
  // (and another account's persisted edits could survive a switch).
  const edits = useMemo(
    () => (!isLive && hydrated ? profileOverlay : {}),
    [isLive, hydrated, profileOverlay],
  );

  const user = useMemo<User | null>(() => {
    if (!baseUser) return null;
    // Identity user — edits + KYC merged, but `following` stays the
    // account-truth value. The live follows-store count is a stat (see
    // SessionStatsContext): folding it in here would rebuild the context
    // value on every follow/unfollow and re-render every consumer.
    let merged: User = { ...baseUser, ...edits };
    // An approved verification grants the identity tier — upgrades only,
    // never a downgrade of what the account already holds.
    if (localApproved && !merged.identityVerified) {
      merged = { ...merged, isVerified: true, identityVerified: true, trustLevel: 'identity' };
    }
    return merged;
  }, [baseUser, edits, localApproved]);

  const verificationStatus = useMemo<VerificationStatus>(() => {
    if (!isLive && hydrated && kycStatus !== 'not_started') return kycStatus;
    return user?.identityVerified ? 'approved' : 'not_started';
  }, [isLive, hydrated, kycStatus, user]);

  const verificationTier = useMemo<VerificationTier>(() => {
    if (!user) return 'none';
    if (user.sellerVerified === true || user.trustLevel === 'seller') return 'seller';
    if (user.identityVerified === true || user.trustLevel === 'identity') return 'identity';
    if (user.trustLevel === 'email') return 'email';
    return 'none';
  }, [user]);

  // Session actions as stable callbacks — the identity context value
  // must not gain a new function identity on unrelated state moves, or
  // the memo below re-publishes and the split is cosmetic.
  const signIn = useCallback(() => {
    if (isLive) {
      void hydrateLiveSession();
      return;
    }
    setIsGuest(false);
  }, [isLive, hydrateLiveSession]);

  const signOut = useCallback(() => {
    if (isLive) {
      void authService.logout().then(() => {
        // Explicit logout is an identity change too — the cache and
        // persisted slices (follows included) go with the session.
        adoptIdentity(null);
        setLiveUser(null);
        setAccountIdentity(null);
        setIsGuest(true);
      });
      return;
    }
    setIsGuest(true);
  }, [isLive, adoptIdentity]);

  const login = useCallback(
    async (email: string, password: string) => {
      if (isLive) {
        await authService.login({ email, password });
        // Credentials are in — drop the previous session's cache and
        // slices now, before the new account's truth resolves, so the
        // old account's data never renders under the new token.
        adoptIdentity(null);
        await hydrateLiveSession();
        return;
      }
      setIsGuest(false);
    },
    [isLive, adoptIdentity, hydrateLiveSession],
  );

  const signup = useCallback(
    async (email: string, password: string, username: string, referralCode?: string) => {
      if (isLive) {
        await authService.signup({ email, password, username, referralCode });
        adoptIdentity(null);
        await hydrateLiveSession();
        return;
      }
      setIsGuest(false);
    },
    [isLive, adoptIdentity, hydrateLiveSession],
  );

  const logout = useCallback(async () => {
    if (isLive) {
      await authService.logout();
      adoptIdentity(null);
      setLiveUser(null);
      setAccountIdentity(null);
    }
    setIsGuest(true);
  }, [isLive, adoptIdentity]);

  const refreshSession = useCallback(async () => {
    if (isLive) await hydrateLiveSession();
  }, [isLive, hydrateLiveSession]);

  const identityValue = useMemo<SessionIdentityValue>(
    () => ({
      user,
      isGuest,
      sessionLoading,
      accountIdentity,
      verificationStatus,
      verificationTier,
      signIn,
      signOut,
      login,
      signup,
      logout,
      refreshSession,
    }),
    [
      user,
      isGuest,
      sessionLoading,
      accountIdentity,
      verificationStatus,
      verificationTier,
      signIn,
      signOut,
      login,
      signup,
      logout,
      refreshSession,
    ],
  );

  // The volatile slice. `null` pre-hydration so useSession()'s merge
  // falls back to the account-truth `user.following` — the identical
  // gate the single-context value applied.
  const statsValue = useMemo<SessionStatsValue>(
    () => ({ followingCount: hydrated ? followingCount : null }),
    [hydrated, followingCount],
  );

  return (
    <SessionIdentityContext.Provider value={identityValue}>
      <SessionStatsContext.Provider value={statsValue}>
        {children}
      </SessionStatsContext.Provider>
    </SessionIdentityContext.Provider>
  );
}

/**
 * The stable identity slice — everything `useSession()` exposes except
 * the live follows count (`user.following` is account truth here).
 * Consumers that only need `user?.id`, avatar, isGuest or the session
 * actions should subscribe here: follow/unfollow stats churn then costs
 * them nothing.
 */
export function useSessionIdentity(): SessionIdentityValue {
  const ctx = useContext(SessionIdentityContext);
  if (!ctx) throw new Error('useSessionIdentity must be used within SessionProvider');
  return ctx;
}

/** The stats slice — live counts/flags that change under the session. */
export function useSessionStats(): SessionStatsValue {
  const ctx = useContext(SessionStatsContext);
  if (!ctx) throw new Error('useSessionStats must be used within SessionProvider');
  return ctx;
}

/**
 * Full session value — unchanged public API. Subscribes to both contexts
 * and folds the live follows count onto `user.following`, so consumers
 * see exactly what the single-context provider served. Consumers that
 * don't read `user.following` (or the future stats) should prefer
 * `useSessionIdentity()` — same value minus the stats subscription.
 */
export function useSession(): SessionValue {
  const identity = useContext(SessionIdentityContext);
  const stats = useContext(SessionStatsContext);
  const value = useMemo<SessionValue | null>(() => {
    if (!identity || !stats) return null;
    const user =
      identity.user && stats.followingCount !== null
        ? { ...identity.user, following: stats.followingCount }
        : identity.user;
    return { ...identity, user };
  }, [identity, stats]);
  if (!value) throw new Error('useSession must be used within SessionProvider');
  return value;
}
