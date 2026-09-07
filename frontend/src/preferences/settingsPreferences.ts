import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ionicons } from '@expo/vector-icons';

export const SETTINGS_PREF_STORAGE_KEY = 'thryftverse:settings-pref:v1';
export const PUSH_NOTIF_PREF_STORAGE_KEY = 'thryftverse:push-notif-pref:v1';

export const LANGUAGE_OPTIONS = [
  'English (EN)',
  'Spanish (ES)',
  'French (FR)',
  'German (DE)',
  'Arabic (AR)',
  'Hindi (HI)',
  'Chinese (ZH)',
  'Portuguese (PT)',
  'Japanese (JA)',
  'Russian (RU)',
  'Turkish (TR)',
  'Korean (KO)',
  'Indonesian (ID)',
] as const;
export type SupportedLanguageOption = (typeof LANGUAGE_OPTIONS)[number];

/**
 * Display metadata for each supported locale.
 * Uses native endonyms (the name of the language in that language)
 * per flagship i18n UX practice — no flags, no English labels.
 */
export interface LocaleDisplayInfo {
  /** i18next locale code (e.g. 'en', 'es') */
  locale: string;
  /** Native endonym — the language name as written in that language */
  endonym: string;
  /** English label for accessibility / debugging */
  englishLabel: string;
}

export const LOCALE_DISPLAY_INFO: LocaleDisplayInfo[] = [
  { locale: 'en', endonym: 'English', englishLabel: 'English' },
  { locale: 'es', endonym: 'Español', englishLabel: 'Spanish' },
  { locale: 'pt', endonym: 'Português', englishLabel: 'Portuguese' },
  { locale: 'fr', endonym: 'Français', englishLabel: 'French' },
  { locale: 'de', endonym: 'Deutsch', englishLabel: 'German' },
  { locale: 'ar', endonym: 'العربية', englishLabel: 'Arabic' },
  { locale: 'hi', endonym: 'हिन्दी', englishLabel: 'Hindi' },
  { locale: 'zh', endonym: '中文', englishLabel: 'Chinese (Mandarin)' },
  { locale: 'ja', endonym: '日本語', englishLabel: 'Japanese' },
  { locale: 'ru', endonym: 'Русский', englishLabel: 'Russian' },
  { locale: 'tr', endonym: 'Türkçe', englishLabel: 'Turkish' },
  { locale: 'ko', endonym: '한국어', englishLabel: 'Korean' },
  { locale: 'id', endonym: 'Bahasa Indonesia', englishLabel: 'Indonesian' },
];

/**
 * Get the native endonym for a language option.
 * Returns the option string itself as fallback.
 */
export function getLanguageEndonym(languageOption: SupportedLanguageOption): string {
  const locale = LANGUAGE_OPTION_TO_LOCALE[languageOption] ?? 'en';
  return LOCALE_DISPLAY_INFO.find((info) => info.locale === locale)?.endonym ?? languageOption;
}

const LANGUAGE_OPTION_TO_LOCALE: Record<string, string> = {
  'English (EN)': 'en',
  'Spanish (ES)': 'es',
  'French (FR)': 'fr',
  'German (DE)': 'de',
  'Arabic (AR)': 'ar',
  'Hindi (HI)': 'hi',
  'Chinese (ZH)': 'zh',
  'Portuguese (PT)': 'pt',
  'Japanese (JA)': 'ja',
  'Russian (RU)': 'ru',
  'Turkish (TR)': 'tr',
  'Korean (KO)': 'ko',
  'Indonesian (ID)': 'id',
};

export interface QuietHoursSettings {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number;   // 0-23
}

export interface FilterPreset {
  id: string;
  name: string;
  sort: string;
  brands: string[];
  sizes: string[];
  condition: string;
  createdAt: string;
}

export interface SettingsPreferences {
  language: SupportedLanguageOption;
  emailNotificationsEnabled: boolean;
  quietHours: QuietHoursSettings;
  mySizes: string[];
  filterPresets: FilterPreset[];
  /**
   * When true, all in-house analytics/telemetry events are suppressed.
   * No event is dispatched to a handler or transmitted to the backend.
   * Defaults to false (analytics enabled) to preserve prior behaviour.
   */
  analyticsOptOut: boolean;
  /**
   * Developer mode — when true, the "Advanced & developer" section is
   * revealed in Settings. Enabled by tapping the version number 7 times
   * on the About screen. Persisted so the preference survives app restarts.
   * Defaults to false so ordinary consumers never see developer tooling.
   */
  developerMode: boolean;
  /**
   * Biometric auth gating — when true (default), sensitive screens
   * (wallet, payments, withdrawals, account deletion) require Face ID /
   * Touch ID / fingerprint re-authentication before revealing content.
   * When false, the biometric gate is skipped and content is shown with
   * a truthful warning. The user can disable this if their device
   * biometrics are unreliable or they prefer password-only auth.
   */
  biometricEnabled: boolean;
  /**
   * When true, returning users with a stored auth snapshot must pass
   * Face ID / Touch ID / fingerprint before the app restores their session.
   * This is distinct from `biometricEnabled` (which gates sensitive actions
   * while already in the app). Opt-in — defaults to false so users who
   * have never enabled it are not surprised by a biometric prompt at launch.
   */
  biometricLoginEnabled: boolean;
  /**
   * Privacy preferences synced to the backend consent record via
   * PATCH /users/me/consent. Local AsyncStorage provides immediate UI
   * feedback; the backend is the authoritative source and is fetched
   * on app launch to initialise the analytics gate.
   */
  personalizedAds: boolean;
  recommendationPersonalization: boolean;
  thirdPartySharing: boolean;
  /**
   * When true, incoming chat messages detected as being in a foreign
   * language are automatically translated to the user's locale via the
   * AI translation endpoint. When false, the user sees a "Translate"
   * button and must tap it manually. Defaults to false (manual) so
   * users maintain control over translation until they opt in.
   */
  autoTranslateMessages: boolean;
}

export interface PushNotificationDefinition {
  key: string;
  label: string;
  subtitle: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  group?: 'orders' | 'social' | 'news';
}

export const PUSH_NOTIFICATION_DEFINITIONS: PushNotificationDefinition[] = [
  { key: 'orderUpdates', label: 'Order updates', subtitle: 'Shipping and delivery status changes', icon: 'car-outline', group: 'orders' },
  { key: 'auctionAlerts', label: 'Auction alerts', subtitle: 'Outbid, auction ending, and auction won alerts', icon: 'trophy-outline', group: 'orders' },
  { key: 'offers', label: 'Offers received', subtitle: 'When buyers make an offer on your item', icon: 'cash-outline', group: 'orders' },
  { key: 'priceDrops', label: 'Price drops', subtitle: 'For items on your wishlist', icon: 'cash-outline', group: 'orders' },
  { key: 'messages', label: 'New messages', subtitle: 'When someone sends you a message', icon: 'chatbubble-outline', group: 'social' },
  { key: 'followers', label: 'New followers', subtitle: 'When someone starts following you', icon: 'person-add-outline', group: 'social' },
  { key: 'wishlist', label: 'Wishlist activity', subtitle: 'When someone likes your item', icon: 'heart-outline', group: 'social' },
  { key: 'news', label: 'Thryftverse news', subtitle: 'Promotions, features and announcements', icon: 'megaphone-outline', group: 'news' },
];

export const PUSH_NOTIFICATION_GROUPS: { key: 'orders' | 'social' | 'news'; label: string }[] = [
  { key: 'orders', label: 'Orders & Shopping' },
  { key: 'social', label: 'Social' },
  { key: 'news', label: 'News' },
];

export type PushNotificationToggles = Record<string, boolean>;

export const DEFAULT_QUIET_HOURS: QuietHoursSettings = {
  enabled: false,
  startHour: 22, // 10 PM
  endHour: 8,    // 8 AM
};

/**
 * Returns true if the current hour falls within the configured quiet hours window.
 * Handles overnight ranges (e.g. 22:00 → 08:00).
 */
export function isQuietHoursActive(settings: QuietHoursSettings, now: Date = new Date()): boolean {
  if (!settings.enabled) return false;
  const hour = now.getHours();
  const { startHour, endHour } = settings;
  if (startHour === endHour) return false;
  if (startHour < endHour) {
    // Same-day range (e.g. 14:00 → 18:00)
    return hour >= startHour && hour < endHour;
  }
  // Overnight range (e.g. 22:00 → 08:00)
  return hour >= startHour || hour < endHour;
}

export const DEFAULT_SETTINGS_PREFERENCES: SettingsPreferences = {
  language: 'English (EN)',
  emailNotificationsEnabled: true,
  quietHours: DEFAULT_QUIET_HOURS,
  mySizes: [],
  filterPresets: [],
  analyticsOptOut: false,
  developerMode: false,
  biometricEnabled: true,
  biometricLoginEnabled: false,
  personalizedAds: false,
  recommendationPersonalization: true,
  thirdPartySharing: false,
  autoTranslateMessages: false,
};

export function buildDefaultPushNotificationToggles(keys: readonly string[]): PushNotificationToggles {
  return Object.fromEntries(keys.map((key) => [key, true])) as PushNotificationToggles;
}

export function countEnabledPushNotificationToggles(toggles: PushNotificationToggles): number {
  return Object.values(toggles).filter(Boolean).length;
}

function isSupportedLanguage(value: unknown): value is SupportedLanguageOption {
  return typeof value === 'string' && LANGUAGE_OPTIONS.includes(value as SupportedLanguageOption);
}

function normalizeQuietHours(raw: unknown): QuietHoursSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_QUIET_HOURS;
  const obj = raw as Partial<QuietHoursSettings>;
  const startHour = typeof obj.startHour === 'number' && obj.startHour >= 0 && obj.startHour <= 23
    ? obj.startHour : DEFAULT_QUIET_HOURS.startHour;
  const endHour = typeof obj.endHour === 'number' && obj.endHour >= 0 && obj.endHour <= 23
    ? obj.endHour : DEFAULT_QUIET_HOURS.endHour;
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_QUIET_HOURS.enabled,
    startHour,
    endHour,
  };
}

export async function getStoredSettingsPreferences(): Promise<SettingsPreferences> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_PREF_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS_PREFERENCES;
    }

    const parsed = JSON.parse(raw) as Partial<SettingsPreferences>;

    return {
      language: isSupportedLanguage(parsed.language)
        ? parsed.language
        : DEFAULT_SETTINGS_PREFERENCES.language,
      emailNotificationsEnabled:
        typeof parsed.emailNotificationsEnabled === 'boolean'
          ? parsed.emailNotificationsEnabled
          : DEFAULT_SETTINGS_PREFERENCES.emailNotificationsEnabled,
      quietHours: normalizeQuietHours(parsed.quietHours),
      mySizes: Array.isArray(parsed.mySizes)
        ? parsed.mySizes.filter((s): s is string => typeof s === 'string')
        : [],
      filterPresets: Array.isArray(parsed.filterPresets)
        ? parsed.filterPresets.filter(
            (p): p is FilterPreset =>
              p != null &&
              typeof p === 'object' &&
              typeof p.id === 'string' &&
              typeof p.name === 'string'
          )
        : [],
      analyticsOptOut:
        typeof parsed.analyticsOptOut === 'boolean'
          ? parsed.analyticsOptOut
          : DEFAULT_SETTINGS_PREFERENCES.analyticsOptOut,
      developerMode:
        typeof parsed.developerMode === 'boolean'
          ? parsed.developerMode
          : DEFAULT_SETTINGS_PREFERENCES.developerMode,
      biometricEnabled:
        typeof parsed.biometricEnabled === 'boolean'
          ? parsed.biometricEnabled
          : DEFAULT_SETTINGS_PREFERENCES.biometricEnabled,
      biometricLoginEnabled:
        typeof parsed.biometricLoginEnabled === 'boolean'
          ? parsed.biometricLoginEnabled
          : DEFAULT_SETTINGS_PREFERENCES.biometricLoginEnabled,
      personalizedAds:
        typeof parsed.personalizedAds === 'boolean'
          ? parsed.personalizedAds
          : DEFAULT_SETTINGS_PREFERENCES.personalizedAds,
      recommendationPersonalization:
        typeof parsed.recommendationPersonalization === 'boolean'
          ? parsed.recommendationPersonalization
          : DEFAULT_SETTINGS_PREFERENCES.recommendationPersonalization,
      thirdPartySharing:
        typeof parsed.thirdPartySharing === 'boolean'
          ? parsed.thirdPartySharing
          : DEFAULT_SETTINGS_PREFERENCES.thirdPartySharing,
      autoTranslateMessages:
        typeof parsed.autoTranslateMessages === 'boolean'
          ? parsed.autoTranslateMessages
          : DEFAULT_SETTINGS_PREFERENCES.autoTranslateMessages,
    };
  } catch {
    return DEFAULT_SETTINGS_PREFERENCES;
  }
}

export async function setStoredSettingsPreferences(preferences: SettingsPreferences): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_PREF_STORAGE_KEY, JSON.stringify(preferences));
}

export async function getStoredPushNotificationToggles(
  defaultToggles: PushNotificationToggles
): Promise<PushNotificationToggles> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_NOTIF_PREF_STORAGE_KEY);
    if (!raw) {
      return defaultToggles;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const merged: PushNotificationToggles = { ...defaultToggles };

    Object.keys(defaultToggles).forEach((key) => {
      if (typeof parsed[key] === 'boolean') {
        merged[key] = parsed[key] as boolean;
      }
    });

    return merged;
  } catch {
    return defaultToggles;
  }
}

export async function setStoredPushNotificationToggles(
  toggles: PushNotificationToggles
): Promise<void> {
  await AsyncStorage.setItem(PUSH_NOTIF_PREF_STORAGE_KEY, JSON.stringify(toggles));
}