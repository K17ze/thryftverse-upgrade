'use client';

/**
 * Settings preferences — the persisted preference layer for the settings
 * subroutes. Mirrors the mobile SettingsPreferencesContext slices the web
 * surfaces need: the push/email notification matrix (with pause/resume
 * snapshots), quiet hours, profile-privacy flags, blocked/restricted
 * account lists, two-factor state and data-consent flags.
 *
 * On mobile these write through to the preferences/consent APIs; on web
 * they persist locally — the authoritative backend sync is called out
 * honestly on each screen.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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

export type PrivacyFlag = 'showCloset' | 'showSaved' | 'allowMessages' | 'showActivity';

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

type PrefMap = Record<NotificationPrefKey, boolean>;

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

  // ── Profile privacy ──
  showCloset: boolean;
  showSaved: boolean;
  allowMessages: boolean;
  showActivity: boolean;
  setPrivacyFlag: (key: PrivacyFlag, enabled: boolean) => void;

  /** Blocked/restricted user ids (fixtures — 'u*' ids, never 'me'). */
  blockedIds: string[];
  restrictedIds: string[];
  blockUser: (id: string) => void;
  unblockUser: (id: string) => void;
  restrictUser: (id: string) => void;
  unrestrictUser: (id: string) => void;

  // ── Security ──
  twoFactorEnabled: boolean;
  setTwoFactorEnabled: (enabled: boolean) => void;

  // ── Data consent ──
  personalisedAds: boolean;
  analytics: boolean;
  recommendations: boolean;
  thirdPartySharing: boolean;
  setDataFlag: (key: DataFlag, enabled: boolean) => void;

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

      showCloset: true,
      showSaved: true,
      allowMessages: true,
      showActivity: true,
      setPrivacyFlag: (key, enabled) => set({ [key]: enabled } as Partial<SettingsPrefsState>),

      blockedIds: ['u4'],
      restrictedIds: ['u2'],
      blockUser: (id) =>
        set((s) => (id === 'me' || s.blockedIds.includes(id) ? s : { blockedIds: [...s.blockedIds, id] })),
      unblockUser: (id) => set((s) => ({ blockedIds: s.blockedIds.filter((x) => x !== id) })),
      restrictUser: (id) =>
        set((s) =>
          id === 'me' || s.restrictedIds.includes(id) ? s : { restrictedIds: [...s.restrictedIds, id] },
        ),
      unrestrictUser: (id) => set((s) => ({ restrictedIds: s.restrictedIds.filter((x) => x !== id) })),

      twoFactorEnabled: false,
      setTwoFactorEnabled: (enabled) => set({ twoFactorEnabled: enabled }),

      personalisedAds: false,
      analytics: true,
      recommendations: true,
      thirdPartySharing: false,
      setDataFlag: (key, enabled) => set({ [key]: enabled } as Partial<SettingsPrefsState>),

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
        showCloset: s.showCloset,
        showSaved: s.showSaved,
        allowMessages: s.allowMessages,
        showActivity: s.showActivity,
        blockedIds: s.blockedIds,
        restrictedIds: s.restrictedIds,
        twoFactorEnabled: s.twoFactorEnabled,
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
