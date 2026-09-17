import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerNotificationDevice,
  deactivateNotificationDevice,
  listNotificationDevices,
} from '../services/notificationsApi';
import type { NotificationDevice } from '../services/notificationsApi';

/**
 * This-device push registration.
 *
 * The server redacts raw push tokens in list responses (they are
 * credentials), so "is THIS device registered?" cannot be answered by
 * comparing tokens client-side. We persist the device id returned by the
 * register call and match it against the active-device list instead.
 * Without this the UI cannot tell "this device" apart from "some device
 * on the account" — and could deactivate the wrong one.
 */
const PUSH_DEVICE_ID_KEY = '@thryftverse/push_device_id';

function resolveExpoProjectId(): string | undefined {
  const fromExpoConfig = (Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)
    ?.extra?.eas?.projectId;
  const fromEasConfig = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return fromExpoConfig ?? fromEasConfig;
}

export function resolvePushPlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export async function getCurrentPushToken(): Promise<string> {
  const projectId = resolveExpoProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  return tokenResponse.data;
}

export async function getStoredPushDeviceId(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_DEVICE_ID_KEY);
    const id = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Registers this device's current Expo push token with the backend and
 * records the returned device id locally. Safe to call repeatedly — the
 * backend upserts on token.
 */
export async function registerCurrentPushDevice(
  metadata?: Record<string, unknown>,
): Promise<NotificationDevice> {
  const token = await getCurrentPushToken();
  const device = await registerNotificationDevice({
    token,
    platform: resolvePushPlatform(),
    appVersion: (Constants.expoConfig as { version?: string } | null)?.version,
    metadata,
  });
  await AsyncStorage.setItem(PUSH_DEVICE_ID_KEY, String(device.id)).catch(() => {});
  return device;
}

/**
 * True when THIS device holds an active registration — not merely any
 * device on the account.
 */
export async function isCurrentDeviceRegistered(): Promise<boolean> {
  const storedId = await getStoredPushDeviceId();
  if (storedId === null) return false;
  const devices = await listNotificationDevices();
  return devices.some((d) => d.isActive && d.id === storedId);
}

/**
 * Deactivates this device's registration. Refuses to guess: with no
 * stored id there is no truthful way to identify this device in a
 * redacted-token list, so we report false rather than deactivating an
 * arbitrary active device belonging to another device on the account.
 */
export async function deactivateCurrentPushDevice(): Promise<boolean> {
  const storedId = await getStoredPushDeviceId();
  if (storedId === null) return false;
  try {
    await deactivateNotificationDevice(storedId);
  } finally {
    await AsyncStorage.removeItem(PUSH_DEVICE_ID_KEY).catch(() => {});
  }
  return true;
}
