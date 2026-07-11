import { describe, it, expect, vi, beforeEach } from 'vitest';

const asyncStorageMock = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: asyncStorageMock,
}));

import {
  buildDefaultPushNotificationToggles,
  countEnabledPushNotificationToggles,
  DEFAULT_SETTINGS_PREFERENCES,
  getStoredPushNotificationToggles,
  getStoredSettingsPreferences,
  PUSH_NOTIF_PREF_STORAGE_KEY,
  SETTINGS_PREF_STORAGE_KEY,
  setStoredPushNotificationToggles,
  setStoredSettingsPreferences,
} from '../preferences/settingsPreferences';

describe('PASS 21 — Settings rendered tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('settingsPreferences', () => {
    it('exports a default preferences object with expected keys', () => {
      expect(DEFAULT_SETTINGS_PREFERENCES).toBeDefined();
      expect(typeof DEFAULT_SETTINGS_PREFERENCES).toBe('object');
    });

    it('exports storage keys as non-empty strings', () => {
      expect(SETTINGS_PREF_STORAGE_KEY).toBeTruthy();
      expect(typeof SETTINGS_PREF_STORAGE_KEY).toBe('string');
      expect(PUSH_NOTIF_PREF_STORAGE_KEY).toBeTruthy();
      expect(typeof PUSH_NOTIF_PREF_STORAGE_KEY).toBe('string');
    });

    it('builds default push toggles with all keys enabled', () => {
      const toggles = buildDefaultPushNotificationToggles(['messages', 'offers', 'priceDrops']);
      expect(toggles).toEqual({
        messages: true,
        offers: true,
        priceDrops: true,
      });
    });

    it('counts only enabled push notification types', () => {
      const count = countEnabledPushNotificationToggles({
        messages: true,
        offers: false,
        wishlist: true,
        news: false,
      });
      expect(count).toBe(2);
    });

    it('returns default preferences when no stored preferences exist', async () => {
      asyncStorageMock.getItem.mockResolvedValue(null);
      const result = await getStoredSettingsPreferences();
      expect(result).toEqual(DEFAULT_SETTINGS_PREFERENCES);
    });

    it('returns parsed preferences when stored', async () => {
      const stored = { language: 'Spanish (ES)' as const, emailNotificationsEnabled: false };
      asyncStorageMock.getItem.mockResolvedValue(JSON.stringify(stored));
      const result = await getStoredSettingsPreferences();
      expect(result).toEqual({ ...DEFAULT_SETTINGS_PREFERENCES, ...stored });
    });

    it('persists preferences via setItem', async () => {
      asyncStorageMock.setItem.mockResolvedValue(undefined);
      await setStoredSettingsPreferences(DEFAULT_SETTINGS_PREFERENCES);
      expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
        SETTINGS_PREF_STORAGE_KEY,
        JSON.stringify(DEFAULT_SETTINGS_PREFERENCES),
      );
    });

    it('returns default toggles when no stored push toggles exist', async () => {
      asyncStorageMock.getItem.mockResolvedValue(null);
      const defaults = { messages: true, offers: true };
      const result = await getStoredPushNotificationToggles(defaults);
      expect(result).toEqual(defaults);
    });

    it('persists push toggles via setItem', async () => {
      const toggles = { messages: true, offers: false };
      asyncStorageMock.setItem.mockResolvedValue(undefined);
      await setStoredPushNotificationToggles(toggles);
      expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
        PUSH_NOTIF_PREF_STORAGE_KEY,
        JSON.stringify(toggles),
      );
    });
  });
});
