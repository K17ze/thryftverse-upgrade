/**
 * Barrel + resolver for the ThryftIntegrity native module.
 *
 * `getIntegrityModule()` lazily requires the native module via the Expo
 * Modules API. When the native code is not linked (web, Expo Go, or a bare
 * JS run without prebuild), `requireNativeModule` throws and we fall back to
 * an `unsupported` stub that returns safe defaults. This lets every caller
 * use the typed interface without try/catching at each call site.
 */

import { Platform } from 'react-native';
import { requireNativeModule } from 'expo';
import type {
  AttestationResult,
  AssertionResult,
  IntegrityPlatform,
  IntegrityTrustState,
  IntegrityVerdict,
  ThryftIntegrityModule,
} from './ThryftIntegrity';

export type {
  AttestationResult,
  AssertionResult,
  IntegrityPlatform,
  IntegrityTrustState,
  IntegrityVerdict,
  ThryftIntegrityModule,
} from './ThryftIntegrity';

type ThryftIntegrityNativeModule = ThryftIntegrityModule & {
  moduleName: string;
};

let nativeModule: ThryftIntegrityNativeModule | null = null;
let nativeModuleLoadError: string | null = null;
let unsupportedStub: ThryftIntegrityModule | null = null;

/**
 * Lazily load the native integrity module via `requireNativeModule`. Returns
 * `null` when the native code is absent so the caller can fall back to the
 * unsupported stub.
 */
function loadNativeModule(): ThryftIntegrityNativeModule | null {
  if (nativeModule !== null || nativeModuleLoadError !== null) {
    return nativeModule;
  }
  try {
    const mod = requireNativeModule<ThryftIntegrityNativeModule>('ThryftNative');
    nativeModule = mod;
  } catch (error) {
    nativeModuleLoadError =
      error instanceof Error ? error.message : String(error);
  }
  return nativeModule;
}

/**
 * The platform backing the integrity module, derived from `Platform.OS`.
 */
function resolvePlatform(): IntegrityPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'unsupported';
}

/**
 * Build a stub module that reports `unsupported` for every method. Used when
 * the native module is not linked so callers receive well-typed, safe
 * defaults rather than thrown errors.
 */
function getUnsupportedStub(): ThryftIntegrityModule {
  if (unsupportedStub) {
    return unsupportedStub;
  }
  unsupportedStub = {
    async isSupported() {
      return false;
    },
    async attest() {
      throw new Error('[ThryftIntegrity] App Attest is not supported on this platform.');
    },
    async generateAssertion() {
      throw new Error('[ThryftIntegrity] App Attest is not supported on this platform.');
    },
    async getTrustState() {
      return 'unsupported';
    },
    async setTrustState() {
      // No-op on unsupported platforms.
    },
    async prepareTokenProvider() {
      // No-op on unsupported platforms.
    },
    async requestIntegrityToken() {
      throw new Error('[ThryftIntegrity] Play Integrity is not supported on this platform.');
    },
    async getDeviceIntegrityVerdict() {
      return [];
    },
  };
  return unsupportedStub;
}

/**
 * Returns the integrity module implementation. Prefers the native module when
 * linked; otherwise returns an `unsupported` stub with safe defaults.
 */
export function getIntegrityModule(): ThryftIntegrityModule {
  const mod = loadNativeModule();
  if (mod) {
    return mod;
  }
  return getUnsupportedStub();
}

/**
 * Whether the native integrity module is linked and will return real
 * attestation / integrity tokens (rather than the unsupported stub).
 */
export function isIntegrityAvailable(): boolean {
  return loadNativeModule() !== null;
}

/**
 * The resolved integrity platform for the current runtime.
 */
export const integrityPlatform: IntegrityPlatform = resolvePlatform();
