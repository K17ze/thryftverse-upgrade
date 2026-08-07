import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Security utilities for ThryftVerse.
 *
 * OWASP Mobile Top 10 (2024) coverage:
 *  - M4: Insecure Communication → see sslPinning.ts
 *  - M5: Insecure Authentication → tokens live in hardware-backed SecureStore
 *  - M7: Insufficient Binary Protections → see SECURITY_HARDENING.md
 *  - M9: Insecure Data Storage → this module
 *
 * NOTE (AGENTS.md §11 — Truthful UI): `isDeviceCompromised` performs best-effort
 * file-existence checks for well-known jailbreak / root indicators via the
 * FileSystem API. A POSITIVE result (indicator found) is meaningful. A negative
 * result is NOT proof of a clean device — the iOS app sandbox and Android's
 * restricted file access prevent the JS layer from reliably reading system
 * paths, so absence of evidence is reported as `null` (unknown), not `false`
 * (clean). A fully reliable check requires a native module
 * (e.g. jail-monkey / io-mtgs-root); until one is integrated, callers must
 * treat `null` as "unknown" and apply server-side enforcement for any hard
 * security gate.
 */

const KEY_PREFIX = '@thryftverse_secure/';

/**
 * Hardware-backed secure storage wrapper around `expo-secure-store`.
 *
 * On iOS values are stored in the Keychain with `kSecAttrAccessibleWhenUnlocked`
 * (this device only, no iCloud sync). On Android values are stored in the
 * Android Keystore (hardware-backed on devices with a TEE/StrongBox).
 *
 * On web, SecureStore is unavailable; the wrapper no-ops so that calls are safe
 * in cross-platform code paths. Sensitive data must never be the primary
 * experience on web — web is a secondary surface.
 */
export const secureStorage = {
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return; // SecureStore not available on web
    await SecureStore.setItemAsync(`${KEY_PREFIX}${key}`, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
  },
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    return SecureStore.getItemAsync(`${KEY_PREFIX}${key}`);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await SecureStore.deleteItemAsync(`${KEY_PREFIX}${key}`);
  },
};

/**
 * Check whether hardware-backed secure storage is available on this device.
 *
 * Returns `false` on web. On native, delegates to `SecureStore.isAvailableAsync`
 * which reports whether the Keychain (iOS) / Keystore (Android) is usable.
 * Production auth code (see `lib/apiClient.ts`) refuses to persist tokens when
 * this returns `false`, forcing a re-login rather than falling back to
 * unencrypted AsyncStorage.
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Best-effort jailbreak / root detection via file-existence checks.
 *
 * Return contract (AGENTS.md §11 — Truthful UI):
 *   `true`  — a known compromise indicator was found (compromised).
 *   `false` — the checks ran and no indicator was found (clean). Only ever
 *             returned when the platform actually allows the checks to run
 *             reliably; currently this is never the case from the JS layer
 *             because of sandbox / permission restrictions, so in practice a
 *             clean platform returns `null`.
 *   `null`  — the check could not be performed or is inconclusive (unknown).
 *             This is the default on iOS (sandbox blocks reading system paths)
 *             and on Android (no root access to /system paths from a non-root
 *             app). Callers that need a hard security gate MUST treat `null`
 *             as "unknown" and enforce server-side.
 *
 * A production-grade implementation requires a native module such as
 * `jail-monkey` (React Native) or `expo-community-fluence-jail-monkey` to
 * detect:
 *  - Cydia / Sileo / jailbroken iOS (via native APIs that bypass the sandbox)
 *  - rooted Android (su binary, Magisk, ro.debuggable)
 *  - emulator / simulator execution
 *  - hooking frameworks (Frida, Xposed)
 *
 * Until a native module is integrated, this function returns `null` (unknown)
 * rather than `false` (clean) so that no caller can believe a real security
 * gate is in place when it is not.
 */
export async function isDeviceCompromised(): Promise<boolean | null> {
  try {
    if (Platform.OS === 'ios') {
      return await checkIosJailbreakIndicators();
    }
    if (Platform.OS === 'android') {
      return await checkAndroidRootIndicators();
    }
    // Web / unknown platform — cannot perform the check.
    return null;
  } catch {
    // Any unexpected failure → unknown, never a false "clean".
    return null;
  }
}

/**
 * iOS jailbreak indicators — well-known paths installed by jailbreak tools.
 *
 * NOTE: the iOS app sandbox prevents reading paths outside the app container,
 * so `FileSystem.getInfoAsync` on these system paths will typically report
 * `exists: false` even on a jailbroken device. Therefore:
 *   - if any path reports `exists: true` → return `true` (a genuine positive).
 *   - otherwise → return `null` (unknown), NOT `false`, because the sandbox
 *     makes a negative result unreliable.
 */
async function checkIosJailbreakIndicators(): Promise<boolean | null> {
  const indicators = [
    '/Applications/Cydia.app',
    '/Applications/Sileo.app',
    '/Applications/Zebra.app',
    '/Applications/Installer.app',
    '/Applications/Undecimus.app',
    '/Library/MobileSubstrate/MobileSubstrate.dylib',
    '/bin/bash',
    '/usr/sbin/sshd',
    '/etc/apt',
    '/private/jailbreak.txt',
  ];

  for (const path of indicators) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info?.exists) {
        return true;
      }
    } catch {
      // Path inaccessible / unreadable — continue to next indicator.
    }
  }
  // No positive found, but the sandbox means we cannot prove the device is
  // clean. Report unknown so callers do not trust a false negative.
  return null;
}

/**
 * Android root indicators — well-known paths/binaries present on rooted devices.
 *
 * NOTE: a non-rooted app cannot read `/system` or `/sbin` paths that require
 * elevated privileges, so `FileSystem.getInfoAsync` on these paths will
 * typically report `exists: false` even on a rooted device. Therefore:
 *   - if any path reports `exists: true` → return `true` (a genuine positive).
 *   - otherwise → return `null` (unknown), NOT `false`, because restricted
 *     file access makes a negative result unreliable.
 */
async function checkAndroidRootIndicators(): Promise<boolean | null> {
  const indicators = [
    '/system/app/Superuser.apk',
    '/system/xbin/su',
    '/system/bin/su',
    '/sbin/su',
    '/su/bin/su',
    '/data/local/tmp/su',
    '/data/local/bin/su',
    '/system/app/MagiskManager.apk',
    '/data/adb/magisk',
    '/data/adb/magisk.db',
    '/system/etc/init.d/magisk',
  ];

  for (const path of indicators) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info?.exists) {
        return true;
      }
    } catch {
      // Path inaccessible / unreadable — continue to next indicator.
    }
  }
  // No positive found, but restricted file access means we cannot prove the
  // device is clean. Report unknown so callers do not trust a false negative.
  return null;
}
