import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * nativeModules.ts — typed bridge to the local `thryft-native` Expo module.
 *
 * The local module (`modules/thryft-native`) exposes two surfaces via the
 * Expo Modules API:
 *   - `getDeviceInfo()`      → { platform, model, osVersion }
 *   - `getNativeBuildInfo()` → { buildVersion, buildTimestamp }
 *
 * On platforms where the native module is not linked (web, Expo Go, or a
 * bare JS run without prebuild), `require('thryft-native')` resolves but
 * `requireNativeModule` inside it throws. We catch that here and fall back
 * to JS-side values derived from `react-native` `Platform` and
 * `expo-constants`, so callers always get a well-typed result.
 */

export type DeviceInfo = {
  platform: string;
  model: string;
  osVersion: string;
};

export type NativeBuildInfo = {
  buildVersion: string;
  buildTimestamp: string;
};

type ThryftNativeModuleShape = {
  getDeviceInfo(): Promise<DeviceInfo>;
  getNativeBuildInfo(): Promise<NativeBuildInfo>;
  moduleName: string;
};

let nativeModule: ThryftNativeModuleShape | null = null;
let nativeModuleLoadError: string | null = null;

/**
 * Lazily load the native module. Wrapped in try/catch so a missing native
 * build never crashes the JS bundle — the fallback values below are used
 * instead.
 */
function loadNativeModule(): ThryftNativeModuleShape | null {
  if (nativeModule !== null || nativeModuleLoadError !== null) {
    return nativeModule;
  }
  try {
    // require() so Metro's inlineRequires defers evaluation until first use.
    const mod = require('thryft-native') as {
      ThryftNative: ThryftNativeModuleShape;
    };
    nativeModule = mod.ThryftNative;
  } catch (error) {
    nativeModuleLoadError =
      error instanceof Error ? error.message : String(error);
  }
  return nativeModule;
}

/**
 * Whether the native `thryft-native` module is loaded and its async methods
 * will return native-side values (rather than JS fallbacks).
 */
export function isThryftNativeAvailable(): boolean {
  return loadNativeModule() !== null;
}

/**
 * Returns device info from the native layer when available, falling back to
 * JS-side `Platform` values otherwise.
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  const mod = loadNativeModule();
  if (mod !== null) {
    try {
      return await mod.getDeviceInfo();
    } catch {
      // Fall through to JS-side fallback below.
    }
  }
  return getDeviceInfoFallback();
}

/**
 * Returns build info from the native layer when available, falling back to
 * `expo-constants` + a JS timestamp otherwise.
 */
export async function getNativeBuildInfo(): Promise<NativeBuildInfo> {
  const mod = loadNativeModule();
  if (mod !== null) {
    try {
      return await mod.getNativeBuildInfo();
    } catch {
      // Fall through to JS-side fallback below.
    }
  }
  return getNativeBuildInfoFallback();
}

// ── JS-side fallbacks ────────────────────────────────────────────────

function getDeviceInfoFallback(): DeviceInfo {
  return {
    platform: Platform.OS,
    // `Platform` does not expose a model string on all platforms; use the
    // constants we do have and leave model as "unknown" when absent.
    model:
      Platform.OS === 'ios'
        ? (Platform.constants as Record<string, unknown> | undefined)?.[
            'modelId'
          ]?.toString() ?? 'unknown'
        : 'unknown',
    osVersion: Platform.Version.toString(),
  };
}

function getNativeBuildInfoFallback(): NativeBuildInfo {
  const expoConfig = Constants.expoConfig;
  const runtimeVersion = expoConfig?.runtimeVersion;
  const buildVersion =
    expoConfig?.version ??
    (typeof runtimeVersion === 'string' ? runtimeVersion : undefined) ??
    'unknown';
  return {
    buildVersion,
    buildTimestamp: new Date().toISOString(),
  };
}
