'use client';

/**
 * Settings preferences — the persisted preference layer for the settings
 * subroutes. Mirrors the mobile SettingsPreferencesContext slices the web
 * surfaces need: the push/email notification matrix (with pause/resume
 * snapshots), quiet hours, profile-privacy flags, blocked/restricted
 * account lists, two-factor state and data-consent flags.
 *
 * Live mode mirrors several slices to account endpoints — the push
 * matrix + quiet hours via GET/PUT /notifications/preferences, the email
 * matrix via GET/PUT /users/me/email-preferences, personalisation via
 * GET/PATCH /users/me/personalisation, and sustainability via
 * GET/PUT /users/me/sustainability-preferences. This store is the
 * optimistic mirror and the fixture/guest-mode truth; the slices with
 * no wire persist locally and say so on their screens.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_PERSONALISATION,
  type AccountStatus,
  type PasskeyRecord,
  type PersonalisationPreferences,
} from '@/lib/contracts/settings';
import type {
  NotificationPreferences,
  NotificationPreviewPolicy,
  NotificationPushCategory,
} from '@/lib/api/services/notifications';
import type { PrivacyConsent } from '@/lib/api/services/users';
import type { EmailPreferences } from '@/lib/api/services/users';

export type NotificationPrefKey =
  // Essential (email only, locked on)
  | 'securityAlerts'
  // Orders & fulfilment
  | 'orderUpdates'
  | 'fulfilmentReminders'
  // Marketplace
  | 'likes'
  | 'offers'
  | 'priceDrops'
  | 'savedSearchAlerts'
  // Social
  | 'followers'
  | 'comments'
  | 'messages'
  // Co-Own & auctions
  | 'auctionAlerts'
  | 'coownDistributions'
  | 'coownCorporateActions'
  // Marketing
  | 'marketing';

export type NotifChannel = 'push' | 'email';

export interface QuietHours {
  enabled: boolean;
  /** 0–23, wall-clock in the user's timezone. */
  startHour: number;
  endHour: number;
}

export type PrivacyFlag =
  | 'showCloset'
  | 'showSaved'
  | 'allowMessages'
  | 'showActivity'
  /** Server-backed flags — live mode mirrors PATCH /users/me/preferences
   *  (privateProfile) and PATCH /users/me/search-visibility. */
  | 'privateProfile'
  | 'searchVisible';

export type DataFlag = 'personalisedAds' | 'analytics' | 'recommendations' | 'thirdPartySharing';

// ── Accessibility (mobile AccessibilitySettingsScreen) ─────────────────────

export type TextSize = 'small' | 'medium' | 'large' | 'xlarge';
export type AccessibilityFlag = 'reduceMotion' | 'highContrast';

// ── Sustainability (mobile SustainabilityPreferencesScreen) ────────────────

export interface SustainabilityPrefs {
  /** kg CO₂ per year; null = no target. */
  carbonTargetKg: number | null;
  /** % of purchases that are secondhand; null = no target. */
  ratioTargetPct: number | null;
  plasticFreePackaging: boolean;
  showBadges: boolean;
  trackImpact: boolean;
  localFirst: boolean;
}

const DEFAULT_SUSTAINABILITY: SustainabilityPrefs = {
  carbonTargetKg: null,
  ratioTargetPct: null,
  plasticFreePackaging: true,
  showBadges: true,
  trackImpact: true,
  localFirst: false,
};

export type PrefMap = Record<NotificationPrefKey, boolean>;

const DEFAULT_PUSH: PrefMap = {
  securityAlerts: false, // email-only category
  orderUpdates: true,
  fulfilmentReminders: true,
  likes: true,
  offers: true,
  priceDrops: true,
  savedSearchAlerts: true,
  followers: true,
  comments: true,
  messages: true,
  auctionAlerts: true,
  coownDistributions: false, // email-only category
  coownCorporateActions: false, // email-only category
  marketing: true,
};

const DEFAULT_EMAIL: PrefMap = {
  securityAlerts: true, // locked on — account-safety mail is never opt-out
  orderUpdates: true,
  fulfilmentReminders: false, // push-only category
  likes: false, // push-only category
  offers: false, // push-only category
  priceDrops: true,
  savedSearchAlerts: true,
  followers: false, // push-only category
  comments: false, // push-only category
  messages: true,
  auctionAlerts: true,
  coownDistributions: true,
  coownCorporateActions: true,
  marketing: false,
};

const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, startHour: 22, endHour: 8 };

// ── Wire sync (GET/PUT /notifications/preferences) ──────────────────────────

/**
 * Web pref key → wire push category. The server vocabulary is coarser
 * than the web matrix: dispatch reminders fold into `orderUpdates`
 * (dispatch_* events gate on it), `likes`, `savedSearchAlerts` and
 * `comments` share `wishlist` (like-your-item, saved_search_match and
 * the review_/reply family all ride it), and `marketing` reads as
 * `news`. Only `securityAlerts` — the locked, email-only row — has no
 * seat here; the email channel has its own endpoint and mapping
 * (EMAIL_PREF_WIRE_FIELD below).
 */
export const PUSH_PREF_WIRE_CATEGORY = {
  orderUpdates: 'orderUpdates',
  fulfilmentReminders: 'orderUpdates',
  likes: 'wishlist',
  offers: 'offers',
  priceDrops: 'priceDrops',
  savedSearchAlerts: 'wishlist',
  followers: 'followers',
  comments: 'wishlist',
  messages: 'messages',
  auctionAlerts: 'auctionAlerts',
  marketing: 'news',
} as const satisfies Partial<Record<NotificationPrefKey, NotificationPushCategory>>;

/** Wire category → mapped web keys (every wire category has ≥1). */
const WIRE_CATEGORY_PREFS = new Map<NotificationPushCategory, NotificationPrefKey[]>();
for (const [key, category] of Object.entries(PUSH_PREF_WIRE_CATEGORY)) {
  const keys = WIRE_CATEGORY_PREFS.get(category) ?? [];
  keys.push(key as NotificationPrefKey);
  WIRE_CATEGORY_PREFS.set(category, keys);
}

/**
 * Project the local push map onto the wire categories for a PUT — a
 * category stays enabled while any mapped toggle is on (the same `some`
 * posture the channel masters report). Inside a shared bucket a
 * granular opt-out is intent only: the wire can't split it, so the
 * bucket keeps delivering until every member is off.
 */
export function wirePushPreferences(
  push: PrefMap,
): Partial<Record<NotificationPushCategory, boolean>> {
  const out: Partial<Record<NotificationPushCategory, boolean>> = {};
  for (const [category, keys] of WIRE_CATEGORY_PREFS) {
    out[category] = keys.some((k) => push[k]);
  }
  return out;
}

// ── Email wire sync (GET/PUT /users/me/email-preferences) ───────────────────

/**
 * Web pref key → wire email field. Unlike push, the email wire is 1:1
 * with the matrix rows that carry an email seat: `savedSearchAlerts`
 * rides `newListingsFromFollowing` (the server's "new listings" bucket —
 * mobile labels the same row "New listings"), and the push-only keys
 * (fulfilmentReminders, likes, offers, followers, comments) have no
 * email field at all.
 */
export const EMAIL_PREF_WIRE_FIELD = {
  securityAlerts: 'securityAlerts',
  orderUpdates: 'orderUpdates',
  priceDrops: 'priceDropAlerts',
  savedSearchAlerts: 'newListingsFromFollowing',
  messages: 'messageNotifications',
  auctionAlerts: 'auctionAlerts',
  coownDistributions: 'distributionNotices',
  coownCorporateActions: 'corporateActionNotices',
  marketing: 'marketing',
} as const satisfies Partial<Record<NotificationPrefKey, keyof EmailPreferences>>;

/**
 * Project the local email map onto the wire fields for a PUT — the
 * mapping is 1:1, so the whole map ships verbatim; a single toggle and
 * the channel master write the same shape.
 */
export function wireEmailPreferences(email: PrefMap): EmailPreferences {
  const out = {} as EmailPreferences;
  for (const [key, field] of Object.entries(EMAIL_PREF_WIRE_FIELD)) {
    out[field] = email[key as NotificationPrefKey];
  }
  return out;
}

interface SettingsPrefsState {
  // ── Notification matrix ──
  push: PrefMap;
  email: PrefMap;
  /**
   * Category mix captured when a channel master is paused — resume
   * restores it instead of force-enabling everything (mobile contract).
   */
  pausedPush: PrefMap | null;
  pausedEmail: PrefMap | null;
  setPref: (channel: NotifChannel, key: NotificationPrefKey, enabled: boolean) => void;
  /** Pause (v=false) snapshots the current mix; resume (v=true) restores it. */
  setChannelMaster: (channel: NotifChannel, enabled: boolean, keys: NotificationPrefKey[]) => void;

  quietHours: QuietHours;
  setQuietHours: (patch: Partial<QuietHours>) => void;

  /**
   * Server-persisted lock-screen preview policy, hydrated from
   * GET /notifications/preferences. The web surface has no editor for
   * it, so the mirror is never written back — a stale local value must
   * not stomp a mobile-set posture.
   */
  previewPolicy: NotificationPreviewPolicy;
  /**
   * Reconcile GET /notifications/preferences into the local mirror
   * (live mode). The wire is coarser than the matrix: a disabled
   * category forces every mapped key off; an enabled one keeps the
   * local split unless nothing local claims the bucket — then the
   * whole group lights up, since the bucket IS delivering.
   */
  syncNotificationPrefs: (server: NotificationPreferences) => void;
  /**
   * Reconcile GET /users/me/email-preferences into the email mirror
   * (live mode). The wire is 1:1 with the mapped rows, so each server
   * value lands verbatim on its key.
   */
  syncEmailPrefs: (server: EmailPreferences) => void;
  /**
   * Whole-channel rollback for a failed live write — restores the exact
   * pre-write map and its pause snapshot in one commit.
   */
  restoreChannelPrefs: (channel: NotifChannel, map: PrefMap, paused: PrefMap | null) => void;

  // ── Profile privacy ──
  showCloset: boolean;
  showSaved: boolean;
  allowMessages: boolean;
  showActivity: boolean;
  /** Only followers see the closet, looks and boards (private_profile). */
  privateProfile: boolean;
  /** Member-search discoverability (search_visibility). */
  searchVisible: boolean;
  setPrivacyFlag: (key: PrivacyFlag, enabled: boolean) => void;

  /** Blocked/restricted/muted user ids (fixtures — 'u*' ids, never 'me').
   *  Live mode hydrates each list from its own GET /users/me/*-users
   *  endpoint; these stay the fixture truth + optimistic mirror. */
  blockedIds: string[];
  restrictedIds: string[];
  mutedIds: string[];
  blockUser: (id: string) => void;
  unblockUser: (id: string) => void;
  restrictUser: (id: string) => void;
  unrestrictUser: (id: string) => void;
  muteUser: (id: string) => void;
  unmuteUser: (id: string) => void;

  // ── Security ──
  twoFactorEnabled: boolean;
  setTwoFactorEnabled: (enabled: boolean) => void;
  /** Sessions the user revoked — subtracted from the fixture/live session
   *  list. Persisted so a revoke survives reload like a server write. */
  revokedSessionIds: string[];
  revokeSession: (id: string) => void;
  /** Undo path — restores a single revoked session. */
  restoreSession: (id: string) => void;
  revokeOtherSessions: (ids: string[]) => void;
  /** Undo path for revoke-all — restores exactly the ids that were cut. */
  restoreSessions: (ids: string[]) => void;
  /** Connected-account ids the user unlinked (fixture seeds stay intact). */
  unlinkedAccountIds: string[];
  unlinkConnectedAccount: (id: string) => void;
  relinkConnectedAccount: (id: string) => void;
  /** Recovery codes — real crypto-random codes issued when 2FA is enabled
   *  on this device. null = none issued yet. */
  backupCodes: string[] | null;
  backupCodesGeneratedAt: string | null;
  /** Issues a fresh set and stamps it; any previous codes are invalidated. */
  regenerateBackupCodes: () => string[];
  clearBackupCodes: () => void;
  /** WebAuthn credentials registered on this device. */
  passkeys: PasskeyRecord[];
  addPasskey: (passkey: PasskeyRecord) => void;
  removePasskey: (credentialId: string) => void;
  /** ISO timestamp of the last local password change; null = never. */
  passwordUpdatedAt: string | null;
  markPasswordUpdated: () => void;
  /** Own-account lifecycle — deactivation is reversible and persists. */
  accountStatus: AccountStatus;
  deactivatedAt: string | null;
  deactivateAccount: () => void;
  reactivateAccount: () => void;

  // ── Personalisation (mobile PersonalisationScreen) ──
  personalisation: PersonalisationPreferences;
  setPersonalisation: (patch: Partial<PersonalisationPreferences>) => void;
  resetPersonalisation: () => void;

  // ── Data consent ──
  personalisedAds: boolean;
  analytics: boolean;
  recommendations: boolean;
  thirdPartySharing: boolean;
  setDataFlag: (key: DataFlag, enabled: boolean) => void;
  /**
   * Reconcile GET /users/me/consent into the local mirror (live mode).
   * The wire's `analyticsOptOut` is opt-OUT while `analytics` here is
   * opt-IN — the hydrate inverts it; the other three map straight.
   */
  syncDataConsent: (server: PrivacyConsent) => void;

  // ── Accessibility ──
  /** Applied as a root zoom — scales text and interface on this device. */
  textSize: TextSize;
  reduceMotion: boolean;
  highContrast: boolean;
  setTextSize: (size: TextSize) => void;
  setAccessibilityFlag: (key: AccessibilityFlag, enabled: boolean) => void;

  // ── Sustainability ──
  sustainability: SustainabilityPrefs;
  setSustainability: (patch: Partial<SustainabilityPrefs>) => void;

  // ── Age self-declaration (mobile AgeVerificationScreen) ──
  /** ISO timestamp of the "I'm 18 or older" declaration; null = not declared. */
  ageConfirmedAt: string | null;
  confirmAge: () => void;
  resetAgeConfirmation: () => void;
}

export const useSettingsPrefs = create<SettingsPrefsState>()(
  persist(
    (set) => ({
      push: DEFAULT_PUSH,
      email: DEFAULT_EMAIL,
      pausedPush: null,
      pausedEmail: null,
      setPref: (channel, key, enabled) =>
        set((s) => ({
          [channel]: { ...s[channel], [key]: enabled },
        })),
      setChannelMaster: (channel, enabled, keys) =>
        set((s) => {
          const pausedKey = channel === 'push' ? 'pausedPush' : 'pausedEmail';
          if (!enabled) {
            const hadAny = keys.some((k) => s[channel][k]);
            const next = { ...s[channel] };
            for (const k of keys) next[k] = false;
            return {
              [channel]: next,
              [pausedKey]: hadAny ? { ...s[channel] } : s[pausedKey],
            } as Partial<SettingsPrefsState>;
          }
          const snapshot = s[pausedKey];
          const next = { ...s[channel] };
          for (const k of keys) next[k] = snapshot?.[k] ?? true;
          return { [channel]: next, [pausedKey]: null } as Partial<SettingsPrefsState>;
        }),

      quietHours: DEFAULT_QUIET_HOURS,
      setQuietHours: (patch) => set((s) => ({ quietHours: { ...s.quietHours, ...patch } })),

      previewPolicy: 'full',
      syncNotificationPrefs: (server) =>
        set((s) => {
          const push = { ...s.push };
          for (const [category, keys] of WIRE_CATEGORY_PREFS) {
            const value = server.preferences[category];
            if (value === false) {
              for (const k of keys) push[k] = false;
            } else if (value === true && keys.every((k) => !push[k])) {
              for (const k of keys) push[k] = true;
            }
            // value === true with some local key on → keep the granular
            // split; the wire can't express it and the mix already
            // satisfies the bucket.
          }
          const quiet = server.quietHours;
          return {
            push,
            // quietHours arrives null when the account holds no window —
            // the honest mirror is disabled with the local bounds kept,
            // never a "silenced" posture the server isn't applying.
            quietHours: quiet
              ? {
                  enabled: quiet.enabled,
                  startHour: quiet.startHour,
                  endHour: quiet.endHour,
                }
              : { ...s.quietHours, enabled: false },
            previewPolicy: server.previewPolicy ?? s.previewPolicy,
          };
        }),
      syncEmailPrefs: (server) =>
        set((s) => {
          const email = { ...s.email };
          for (const [key, field] of Object.entries(EMAIL_PREF_WIRE_FIELD)) {
            const value = server[field];
            if (typeof value === 'boolean') {
              email[key as NotificationPrefKey] = value;
            }
          }
          return { email };
        }),
      restoreChannelPrefs: (channel, map, paused) =>
        set(() =>
          channel === 'push'
            ? { push: { ...map }, pausedPush: paused ? { ...paused } : null }
            : { email: { ...map }, pausedEmail: paused ? { ...paused } : null },
        ),

      showCloset: true,
      showSaved: true,
      allowMessages: true,
      showActivity: true,
      privateProfile: false,
      searchVisible: true,
      setPrivacyFlag: (key, enabled) => set({ [key]: enabled } as Partial<SettingsPrefsState>),

      blockedIds: ['u4'],
      restrictedIds: ['u2'],
      mutedIds: [],
      blockUser: (id) =>
        set((s) => (id === 'me' || s.blockedIds.includes(id) ? s : { blockedIds: [...s.blockedIds, id] })),
      unblockUser: (id) => set((s) => ({ blockedIds: s.blockedIds.filter((x) => x !== id) })),
      restrictUser: (id) =>
        set((s) =>
          id === 'me' || s.restrictedIds.includes(id) ? s : { restrictedIds: [...s.restrictedIds, id] },
        ),
      unrestrictUser: (id) => set((s) => ({ restrictedIds: s.restrictedIds.filter((x) => x !== id) })),
      muteUser: (id) =>
        set((s) =>
          id === 'me' || s.mutedIds.includes(id) ? s : { mutedIds: [...s.mutedIds, id] },
        ),
      unmuteUser: (id) => set((s) => ({ mutedIds: s.mutedIds.filter((x) => x !== id) })),

      twoFactorEnabled: false,
      setTwoFactorEnabled: (enabled) => set({ twoFactorEnabled: enabled }),
      revokedSessionIds: [],
      revokeSession: (id) =>
        set((s) =>
          s.revokedSessionIds.includes(id)
            ? s
            : { revokedSessionIds: [...s.revokedSessionIds, id] },
        ),
      restoreSession: (id) =>
        set((s) => ({ revokedSessionIds: s.revokedSessionIds.filter((x) => x !== id) })),
      revokeOtherSessions: (ids) =>
        set((s) => ({
          revokedSessionIds: [...new Set([...s.revokedSessionIds, ...ids])],
        })),
      restoreSessions: (ids) =>
        set((s) => ({
          revokedSessionIds: s.revokedSessionIds.filter((x) => !ids.includes(x)),
        })),
      unlinkedAccountIds: [],
      unlinkConnectedAccount: (id) =>
        set((s) =>
          s.unlinkedAccountIds.includes(id)
            ? s
            : { unlinkedAccountIds: [...s.unlinkedAccountIds, id] },
        ),
      relinkConnectedAccount: (id) =>
        set((s) => ({ unlinkedAccountIds: s.unlinkedAccountIds.filter((x) => x !== id) })),
      backupCodes: null,
      backupCodesGeneratedAt: null,
      regenerateBackupCodes: () => {
        // Real single-use-grade material: crypto-random, unambiguous
        // alphabet (no 0/O, 1/I), grouped for reading aloud.
        const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        const bytes = new Uint8Array(8 * 8);
        crypto.getRandomValues(bytes);
        const codes: string[] = [];
        for (let c = 0; c < 8; c += 1) {
          let raw = '';
          for (let i = 0; i < 8; i += 1) {
            raw += alphabet[bytes[c * 8 + i] % alphabet.length];
          }
          codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
        }
        set({ backupCodes: codes, backupCodesGeneratedAt: new Date().toISOString() });
        return codes;
      },
      clearBackupCodes: () => set({ backupCodes: null, backupCodesGeneratedAt: null }),
      passkeys: [],
      addPasskey: (passkey) =>
        set((s) =>
          s.passkeys.some((p) => p.credentialId === passkey.credentialId)
            ? s
            : { passkeys: [...s.passkeys, passkey] },
        ),
      removePasskey: (credentialId) =>
        set((s) => ({ passkeys: s.passkeys.filter((p) => p.credentialId !== credentialId) })),
      passwordUpdatedAt: null,
      markPasswordUpdated: () => set({ passwordUpdatedAt: new Date().toISOString() }),
      accountStatus: 'active',
      deactivatedAt: null,
      deactivateAccount: () =>
        set({ accountStatus: 'deactivated', deactivatedAt: new Date().toISOString() }),
      reactivateAccount: () => set({ accountStatus: 'active', deactivatedAt: null }),

      personalisation: DEFAULT_PERSONALISATION,
      setPersonalisation: (patch) =>
        set((s) => ({ personalisation: { ...s.personalisation, ...patch } })),
      resetPersonalisation: () => set({ personalisation: { ...DEFAULT_PERSONALISATION } }),

      personalisedAds: false,
      analytics: true,
      recommendations: true,
      thirdPartySharing: false,
      setDataFlag: (key, enabled) => set({ [key]: enabled } as Partial<SettingsPrefsState>),
      syncDataConsent: (server) =>
        set({
          personalisedAds: server.personalisedAds,
          recommendations: server.recommendationPersonalisation,
          thirdPartySharing: server.partnerSharing,
          analytics: !server.analyticsOptOut,
        }),

      textSize: 'medium',
      reduceMotion: false,
      highContrast: false,
      setTextSize: (size) => set({ textSize: size }),
      setAccessibilityFlag: (key, enabled) =>
        set({ [key]: enabled } as Partial<SettingsPrefsState>),

      sustainability: DEFAULT_SUSTAINABILITY,
      setSustainability: (patch) =>
        set((s) => ({ sustainability: { ...s.sustainability, ...patch } })),

      ageConfirmedAt: null,
      confirmAge: () => set({ ageConfirmedAt: new Date().toISOString() }),
      resetAgeConfirmation: () => set({ ageConfirmedAt: null }),
    }),
    {
      name: 'thryftverse.web.settings-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        push: s.push,
        email: s.email,
        pausedPush: s.pausedPush,
        pausedEmail: s.pausedEmail,
        quietHours: s.quietHours,
        previewPolicy: s.previewPolicy,
        showCloset: s.showCloset,
        showSaved: s.showSaved,
        allowMessages: s.allowMessages,
        showActivity: s.showActivity,
        privateProfile: s.privateProfile,
        searchVisible: s.searchVisible,
        blockedIds: s.blockedIds,
        restrictedIds: s.restrictedIds,
        mutedIds: s.mutedIds,
        twoFactorEnabled: s.twoFactorEnabled,
        revokedSessionIds: s.revokedSessionIds,
        unlinkedAccountIds: s.unlinkedAccountIds,
        backupCodes: s.backupCodes,
        backupCodesGeneratedAt: s.backupCodesGeneratedAt,
        passkeys: s.passkeys,
        passwordUpdatedAt: s.passwordUpdatedAt,
        accountStatus: s.accountStatus,
        deactivatedAt: s.deactivatedAt,
        personalisation: s.personalisation,
        personalisedAds: s.personalisedAds,
        analytics: s.analytics,
        recommendations: s.recommendations,
        thirdPartySharing: s.thirdPartySharing,
        textSize: s.textSize,
        reduceMotion: s.reduceMotion,
        highContrast: s.highContrast,
        sustainability: s.sustainability,
        ageConfirmedAt: s.ageConfirmedAt,
      }),
    },
  ),
);

/** True when any of the supplied keys is enabled on the channel — the
 * honest master posture (mirrors mobile's enabledCount > 0). */
export function channelAnyEnabled(prefs: PrefMap, keys: NotificationPrefKey[]): boolean {
  return keys.some((k) => prefs[k]);
}

/**
 * Local consent flags → PATCH /users/me/consent body. The route writes
 * every column per call — omitted fields reset to schema defaults rather
 * than being preserved — so the body must always carry the full
 * projection. `analytics` (opt-in) inverts onto `analyticsOptOut`.
 */
export function wirePrivacyConsent(s: {
  personalisedAds: boolean;
  analytics: boolean;
  recommendations: boolean;
  thirdPartySharing: boolean;
}): Omit<PrivacyConsent, 'updatedAt'> {
  return {
    personalisedAds: s.personalisedAds,
    recommendationPersonalisation: s.recommendations,
    partnerSharing: s.thirdPartySharing,
    analyticsOptOut: !s.analytics,
  };
}

/**
 * True when the current hour falls inside the quiet-hours window —
 * ported from the mobile isQuietHoursActive: handles overnight ranges
 * (e.g. 22:00 → 08:00) and a zero-width window reads as off.
 */
export function isQuietHoursActive(
  hours: QuietHours,
  now: Date = new Date(),
): boolean {
  if (!hours.enabled) return false;
  const hour = now.getHours();
  const { startHour, endHour } = hours;
  if (startHour === endHour) return false;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}
