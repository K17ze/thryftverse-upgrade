import { NativeModule, requireNativeModule } from 'expo';

/**
 * ThryftNative — local Expo module proof-of-concept.
 *
 * Exposes two surfaces from the native layer:
 *  - `getDeviceInfo()`  → platform, model, OS version
 *  - `getNativeBuildInfo()` → build version + timestamp
 *
 * The module is implemented with the Expo Modules API (Kotlin + Swift), not
 * raw Codegen TurboModules, so it integrates with Expo's autolinking and the
 * New Architecture without manual view-manager registration.
 *
 * On platforms where the native module is not linked (web, Expo Go without a
 * custom dev client, or a bare JS run), `requireNativeModule` throws. The
 * `src/platform/nativeModules.ts` wrapper catches that and falls back to
 * JS-side values, so callers never need to try/catch.
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

export type ThryftNativeModuleType = NativeModule & {
  getDeviceInfo(): Promise<DeviceInfo>;
  getNativeBuildInfo(): Promise<NativeBuildInfo>;
  /** Synchronous constant exposed via the Expo Modules API `Constant`. */
  moduleName: string;
};

/**
 * Lazily require the native module. Exported so the platform wrapper can
 * guard the call and fall back gracefully when the native code is absent.
 */
export const ThryftNative: ThryftNativeModuleType =
  requireNativeModule<ThryftNativeModuleType>('ThryftNative');

export { DeviceInfo, NativeBuildInfo, ThryftNativeModuleType };
