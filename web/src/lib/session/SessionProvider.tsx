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
 * Verification: the persisted KYC outcome (components/verification store)
 * is merged into the session user — an approved demo verification upgrades
 * identityVerified/trustLevel so /profile and /settings read one truth.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@/lib/contracts/domain';
import { CURRENT_USER } from '@/lib/data/fixtures';
import { useHydrated } from '@/lib/store/useStore';
import { hydrateSavedLists } from '@/lib/store/useStore';
import { hydrateFollows, useFollows } from '@/lib/store/follows';
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
  signup: (email: string, password: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-pull /users/me after an account mutation (e.g. phone update). */
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const isLive = DATA_MODE === 'live';

  // Design-mode default: signed-in demo user, matching the mobile app's
  // fixture-design mode which renders authenticated surfaces. Live mode
  // starts neutral — guest until /users/me proves otherwise.
  const [isGuest, setIsGuest] = useState(isLive);
  const [liveUser, setLiveUser] = useState<User | null>(null);
  const [accountIdentity, setAccountIdentity] = useState<AccountIdentity | null>(null);
  const [sessionLoading, setSessionLoading] = useState(isLive);

  // Persisted KYC outcome — hydration-gated so SSR and the first client
  // render agree before localStorage truth lands.
  const hydrated = useHydrated();
  const kycStatus = useVerificationStore((s) => s.status);
  const profileOverlay = useProfileEdit((s) => s.overlay);
  const followingCount = useFollows((s) => s.followingIds.length);

  const hydrateLiveSession = useCallback(async () => {
    try {
      const me = await authService.fetchMe();
      setLiveUser(me.user);
      setAccountIdentity(me.account);
      setIsGuest(!me.user);
      if (me.user) {
        void hydrateSavedLists();
        void hydrateFollows(me.user.id);
      } else {
        // Resolved guest — a persisted set (e.g. fixture-mode seeds) would
        // mark strangers followed on a signed-out session. Clear it.
        useFollows.setState({ followingIds: [] });
      }
    } catch {
      // Network/server failure — keep whatever session state we have rather
      // than bouncing to guest on a transient outage.
      setLiveUser(null);
      setAccountIdentity(null);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLive) return;
    void hydrateLiveSession();
    const onExpired = () => {
      setLiveUser(null);
      setAccountIdentity(null);
      setIsGuest(true);
      // Expired session = guest — drop the persisted follows so a stale
      // set never renders as the next visitor's truth.
      useFollows.setState({ followingIds: [] });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [isLive, hydrateLiveSession]);

  const baseUser = isGuest ? null : isLive ? liveUser : CURRENT_USER;
  const localApproved = hydrated && kycStatus === 'approved';
  // Same hydration gate as KYC — local edits land only after hydration so
  // SSR and the first client render agree.
  const edits = useMemo(() => (hydrated ? profileOverlay : {}), [hydrated, profileOverlay]);

  const user = useMemo<User | null>(() => {
    if (!baseUser) return null;
    // Same hydration gate as KYC — the persisted follows count lands only
    // after localStorage truth is known; SSR renders the account value.
    let merged: User = {
      ...baseUser,
      ...edits,
      following: hydrated ? followingCount : baseUser.following,
    };
    // An approved verification grants the identity tier — upgrades only,
    // never a downgrade of what the account already holds.
    if (localApproved && !merged.identityVerified) {
      merged = { ...merged, isVerified: true, identityVerified: true, trustLevel: 'identity' };
    }
    return merged;
  }, [baseUser, edits, localApproved, hydrated, followingCount]);

  const verificationStatus = useMemo<VerificationStatus>(() => {
    if (hydrated && kycStatus !== 'not_started') return kycStatus;
    return user?.identityVerified ? 'approved' : 'not_started';
  }, [hydrated, kycStatus, user]);

  const verificationTier = useMemo<VerificationTier>(() => {
    if (!user) return 'none';
    if (user.sellerVerified === true || user.trustLevel === 'seller') return 'seller';
    if (user.identityVerified === true || user.trustLevel === 'identity') return 'identity';
    if (user.trustLevel === 'email') return 'email';
    return 'none';
  }, [user]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      isGuest,
      sessionLoading,
      accountIdentity,
      verificationStatus,
      verificationTier,
      signIn: () => {
        if (isLive) {
          void hydrateLiveSession();
          return;
        }
        setIsGuest(false);
      },
      signOut: () => {
        if (isLive) {
          void authService.logout().then(() => {
            setLiveUser(null);
            setAccountIdentity(null);
            setIsGuest(true);
          });
          return;
        }
        setIsGuest(true);
      },
      login: async (email, password) => {
        if (isLive) {
          await authService.login({ email, password });
          await hydrateLiveSession();
          return;
        }
        setIsGuest(false);
      },
      signup: async (email, password, username) => {
        if (isLive) {
          await authService.signup({ email, password, username });
          await hydrateLiveSession();
          return;
        }
        setIsGuest(false);
      },
      logout: async () => {
        if (isLive) {
          await authService.logout();
          setLiveUser(null);
          setAccountIdentity(null);
        }
        setIsGuest(true);
      },
      refreshSession: async () => {
        if (isLive) await hydrateLiveSession();
      },
    }),
    [user, isGuest, sessionLoading, accountIdentity, verificationStatus, verificationTier, isLive, hydrateLiveSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
