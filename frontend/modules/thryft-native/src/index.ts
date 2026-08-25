import { NativeModule, requireNativeModule } from 'expo';

/**
 * ThryftNative — local Expo module bridging native platform capabilities.
 *
 * Exposes three typed surfaces from a single native module
 * (`ThryftNative`, registered via the Expo Modules API in Swift + Kotlin):
 *
 *  - `ThryftNative`       → device info + build info (backward compatible)
 *  - `ThryftIntegrity`    → App Attest (iOS) / Play Integrity (Android)
 *  - `ThryftPerformance`  → os_signpost / MetricKit (iOS) / Trace (Android)
 *
 * The module is implemented with the Expo Modules API (Kotlin + Swift), not
 * raw Codegen TurboModules, so it integrates with Expo's autolinking and the
 * New Architecture without manual view-manager registration.
 *
 * On platforms where the native module is not linked (web, Expo Go without a
 * custom dev client, or a bare JS run), `requireNativeModule` throws. The
 * `src/platform/{integrity,performance}/index.ts` resolvers catch that and
 * fall back to truthful `unsupported` / no-op stubs, so callers never need
 * to try/catch.
 */

// ── Device / build info (original surface) ────────────────────────────

export type DeviceInfo = {
  platform: string;
  model: string;
  osVersion: string;
};

export type NativeBuildInfo = {
  buildVersion: string;
  buildTimestamp: string;
};

// ── Integrity types ───────────────────────────────────────────────────

export type IntegrityPlatform = 'ios' | 'android' | 'unsupported';

export type IntegrityTrustState =
  | 'unchecked'
  | 'attesting'
  | 'trusted'
  | 'unsupported'
  | 'failed';

export interface AttestationResult {
  keyId: string;
  attestation: string;
  challenge: string;
}

export interface AssertionResult {
  assertion: string;
  requestHash: string;
}

export interface IntegrityVerdict {
  platform: IntegrityPlatform;
  trustState: IntegrityTrustState;
  deviceIntegrity?: string[];
  isSupported: boolean;
}

// ── Performance types ─────────────────────────────────────────────────

export type SurfaceName =
  | 'HomeFeed'
  | 'PDP'
  | 'Inbox'
  | 'Chat'
  | 'Looks'
  | 'Creator'
  | 'Camera'
  | 'Search'
  | 'Profile';

export interface PerfMetric {
  surface: SurfaceName;
  ttffMs: number;
  ttiMs: number;
  fidMs: number;
  fidType: string;
  timestamp: number;
  sessionId: string;
}

export interface MetricKitReport {
  reportType: string;
  payloadJson: string;
  receivedAt: number;
}

// ── Module type ───────────────────────────────────────────────────────

export type ThryftNativeModuleType = NativeModule & {
  // Device / build info
  getDeviceInfo(): Promise<DeviceInfo>;
  getNativeBuildInfo(): Promise<NativeBuildInfo>;

  // Integrity
  isSupported(): Promise<boolean>;
  attest(challenge: string): Promise<AttestationResult>;
  generateAssertion(keyId: string, requestHash: string): Promise<AssertionResult>;
  getTrustState(): Promise<IntegrityTrustState>;
  setTrustState(state: IntegrityTrustState): Promise<void>;
  prepareTokenProvider(): Promise<void>;
  requestIntegrityToken(requestHash: string): Promise<string>;
  getDeviceIntegrityVerdict(): Promise<string[]>;

  // Performance
  beginSignpost(name: string, message?: string): Promise<void>;
  endSignpost(name: string, message?: string): Promise<void>;
  startSurfaceMeasurement(surface: SurfaceName): Promise<string>;
  markFirstFrame(sessionId: string): Promise<void>;
  markInteractive(sessionId: string): Promise<void>;
  getMetrics(sessionId: string): Promise<PerfMetric>;
  markCameraPermissionGranted(sessionId: string): Promise<void>;
  markCameraReady(sessionId: string): Promise<void>;
  subscribeToMetricReports(callback: (report: MetricKitReport) => void): Promise<void>;
  getLaunchMetrics(): Promise<{ coldStartMs: number; warmStartMs: number }>;

  /** Synchronous constant exposed via the Expo Modules API `Constant`. */
  moduleName: string;
};

/**
 * Lazily require the native module. Exported so the platform wrappers can
 * guard the call and fall back gracefully when the native code is absent.
 */
export const ThryftNative: ThryftNativeModuleType =
  requireNativeModule<ThryftNativeModuleType>('ThryftNative');

/**
 * Typed integrity view of the same native module. Exported so the
 * `src/platform/integrity` resolver can load it by name.
 */
export const ThryftIntegrity: ThryftNativeModuleType = ThryftNative;

/**
 * Typed performance view of the same native module. Exported so the
 * `src/platform/performance` resolver can load it by name.
 */
export const ThryftPerformance: ThryftNativeModuleType = ThryftNative;

export {
  DeviceInfo,
  NativeBuildInfo,
  ThryftNativeModuleType,
  AttestationResult,
  AssertionResult,
  IntegrityPlatform,
  IntegrityTrustState,
  IntegrityVerdict,
  PerfMetric,
  MetricKitReport,
  SurfaceName,
};
