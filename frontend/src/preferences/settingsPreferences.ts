import AsyncStorage from '@react-native-async-storage/async-storage';

export const SETTINGS_PREF_STORAGE_KEY = 'thryftverse:settings-pref:v1';
export const PUSH_NOTIF_PREF_STORAGE_KEY = 'thryftverse:push-notif-pref:v1';

export const LANGUAGE_OPTIONS = ['English (EN)', 'Spanish (ES)', 'French (FR)', 'German (DE)'] as const;
export type SupportedLanguageOption = (typeof LANGUAGE_OPTIONS)[number];

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
}

export interface PushNotificationDefinition {
  key: string;
  label: string;
  subtitle: string;
  icon?: string;
  iconColor?: string;
  group?: 'orders' | 'social' | 'news';
}

export const PUSH_NOTIFICATION_DEFINITIONS: PushNotificationDefinition[] = [
  { key: 'orderUpdates', label: 'Order updates', subtitle: 'Shipping and delivery status changes', icon: 'cube-outline', group: 'orders' },
  { key: 'offers', label: 'Offers received', subtitle: 'When buyers make an offer on your item', icon: 'tag-outline', group: 'orders' },
  { key: 'priceDrops', label: 'Price drops', subtitle: 'For items on your wishlist', icon: 'pricetag-outline', group: 'orders' },
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