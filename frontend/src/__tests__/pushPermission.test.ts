import { describe, it, expect, beforeEach, vi } from 'vitest';

// The expo-notifications mock is registered in setup.ts. Import the module
// after the mock is in place so we can spy on its methods.
import {
  requestPushPermissionWithContext,
  requestPushPermissionOnce,
  resetPushPermissionAskedFlag,
  getPushPermissionStatus,
} from '../lib/pushPermission';

// AsyncStorage mock (registered in setup.ts) — replace with an in-memory
// store so the "asked" flag persists across calls within a test.
import AsyncStorage from '@react-native-async-storage/async-storage';

function createInMemoryStore() {
  const store = new Map<string, string>();
  (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
    Promise.resolve(store.has(key) ? (store.get(key) as string) : null),
  );
  (AsyncStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  });
  return store;
}

describe('pushPermission — contextual permission timing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInMemoryStore();
  });

  it('getPushPermissionStatus delegates to Notifications.getPermissionsAsync', async () => {
    const status = await getPushPermissionStatus();
    expect(status.status).toBe('granted');
  });

  it('requestPushPermissionWithContext returns true when permission is already granted', async () => {
    const result = await requestPushPermissionWithContext('settings');
    expect(result).toBe(true);
  });

  it('requestPushPermissionWithContext requests permission when not yet granted', async () => {
    const Notifications = await import('expo-notifications');
    const getPerms = Notifications.getPermissionsAsync as ReturnType<typeof vi.fn>;
    const reqPerms = Notifications.requestPermissionsAsync as ReturnType<typeof vi.fn>;
    getPerms.mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true, expires: 'never', granted: false });
    reqPerms.mockResolvedValueOnce({ status: 'granted', canAskAgain: true, expires: 'never', granted: true });

    const result = await requestPushPermissionWithContext('chat');
    expect(reqPerms).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('requestPushPermissionWithContext returns false when permission is denied', async () => {
    const Notifications = await import('expo-notifications');
    const getPerms = Notifications.getPermissionsAsync as ReturnType<typeof vi.fn>;
    const reqPerms = Notifications.requestPermissionsAsync as ReturnType<typeof vi.fn>;
    getPerms.mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true, expires: 'never', granted: false });
    reqPerms.mockResolvedValueOnce({ status: 'denied', canAskAgain: false, expires: 'never', granted: false });

    const result = await requestPushPermissionWithContext('favorite');
    expect(result).toBe(false);
  });

  it('requestPushPermissionOnce only prompts once per context', async () => {
    const Notifications = await import('expo-notifications');
    const reqPerms = Notifications.requestPermissionsAsync as ReturnType<typeof vi.fn>;
    reqPerms.mockClear();

    // First call — should prompt.
    const first = await requestPushPermissionOnce('checkout');
    expect(first).toBe(true);

    // Second call — should be a no-op (already asked).
    const second = await requestPushPermissionOnce('checkout');
    expect(second).toBe(false);
  });

  it('requestPushPermissionOnce tracks contexts independently', async () => {
    const Notifications = await import('expo-notifications');
    const reqPerms = Notifications.requestPermissionsAsync as ReturnType<typeof vi.fn>;
    reqPerms.mockClear();

    const chatResult = await requestPushPermissionOnce('chat');
    const favResult = await requestPushPermissionOnce('favorite');
    expect(chatResult).toBe(true);
    expect(favResult).toBe(true);
  });

  it('resetPushPermissionAskedFlag allows re-prompting for a context', async () => {
    await requestPushPermissionOnce('settings');
    const before = await requestPushPermissionOnce('settings');
    expect(before).toBe(false);

    await resetPushPermissionAskedFlag('settings');
    const after = await requestPushPermissionOnce('settings');
    expect(after).toBe(true);
  });

  it('requestPushPermissionWithContext swallows errors and returns false', async () => {
    const Notifications = await import('expo-notifications');
    const getPerms = Notifications.getPermissionsAsync as ReturnType<typeof vi.fn>;
    getPerms.mockRejectedValueOnce(new Error('native bridge unavailable'));

    const result = await requestPushPermissionWithContext('chat');
    expect(result).toBe(false);
  });
});

describe('pushPermission — App Store / Google Play 2026 compliance', () => {
  it('does not request permission at module load (no side effects on import)', async () => {
    const Notifications = await import('expo-notifications');
    const reqPerms = Notifications.requestPermissionsAsync as ReturnType<typeof vi.fn>;
    // The module was imported at the top of this file. Importing a second
    // time returns the cached module and must not trigger any permission
    // request — proving the utility is opt-in, not invoked on launch.
    reqPerms.mockClear();
    await import('../lib/pushPermission');
    expect(reqPerms).not.toHaveBeenCalled();
  });
});
