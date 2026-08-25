/**
 * Barrel + resolver for the ThryftPerformance native module.
 *
 * `getPerformanceModule()` lazily requires the native module via the Expo
 * Modules API. When the native code is not linked (web, Expo Go, or a bare
 * JS run without prebuild), `requireNativeModule` throws and we fall back to
 * a no-op stub that returns zeroed metrics. This lets React components use
 * `useSurfacePerf` unconditionally without try/catching at each call site.
 */

import { Platform } from 'react-native';
import { requireNativeModule } from 'expo';
import type {
  MetricKitReport,
  PerfMetric,
  SurfaceName,
  ThryftPerformanceModule,
} from './ThryftPerformance';

export type {
  MetricKitReport,
  PerfMetric,
  SurfaceName,
  ThryftPerformanceModule,
} from './ThryftPerformance';

export { useSurfacePerf } from './useSurfacePerf';
export type { UseSurfacePerfResult } from './useSurfacePerf';

type ThryftPerformanceNativeModule = ThryftPerformanceModule & {
  moduleName: string;
};

let nativeModule: ThryftPerformanceNativeModule | null = null;
let nativeModuleLoadError: string | null = null;
let noopStub: ThryftPerformanceModule | null = null;

/**
 * Lazily load the native performance module via `requireNativeModule`. Returns
 * `null` when the native code is absent so the caller can fall back to the
 * no-op stub.
 */
function loadNativeModule(): ThryftPerformanceNativeModule | null {
  if (nativeModule !== null || nativeModuleLoadError !== null) {
    return nativeModule;
  }
  try {
    const mod = requireNativeModule<ThryftPerformanceNativeModule>('ThryftNative');
    nativeModule = mod;
  } catch (error) {
    nativeModuleLoadError =
      error instanceof Error ? error.message : String(error);
  }
  return nativeModule;
}

let stubSessionCounter = 0;

/**
 * Build a no-op stub module that returns zeroed metrics. Used when the native
 * module is not linked so callers receive well-typed, safe defaults.
 */
function getNoopStub(): ThryftPerformanceModule {
  if (noopStub) {
    return noopStub;
  }
  noopStub = {
    async beginSignpost() {
      // No-op.
    },
    async endSignpost() {
      // No-op.
    },
    async startSurfaceMeasurement() {
      stubSessionCounter += 1;
      return `stub-perf-${stubSessionCounter}`;
    },
    async markFirstFrame() {
      // No-op.
    },
    async markInteractive() {
      // No-op.
    },
    async getMetrics(sessionId) {
      return {
        surface: 'HomeFeed' as SurfaceName,
        ttffMs: 0,
        ttiMs: 0,
        fidMs: 0,
        fidType: '',
        timestamp: Date.now(),
        sessionId,
      };
    },
    async markCameraPermissionGranted() {
      // No-op.
    },
    async markCameraReady() {
      // No-op.
    },
    async subscribeToMetricReports() {
      // No-op — no reports on unsupported platforms.
    },
    async getLaunchMetrics() {
      return { coldStartMs: 0, warmStartMs: 0 };
    },
  };
  return noopStub;
}

/**
 * Returns the performance module implementation. Prefers the native module
 * when linked; otherwise returns a no-op stub with zeroed metrics.
 */
export function getPerformanceModule(): ThryftPerformanceModule {
  const mod = loadNativeModule();
  if (mod) {
    return mod;
  }
  return getNoopStub();
}

/**
 * Whether the native performance module is linked and will return real
 * signpost / surface metrics (rather than the no-op stub).
 */
export function isPerformanceAvailable(): boolean {
  return loadNativeModule() !== null;
}

/**
 * Whether the runtime platform supports native performance instrumentation.
 * Web never supports it; iOS and Android do when the module is linked.
 */
export function isPerformancePlatformSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
