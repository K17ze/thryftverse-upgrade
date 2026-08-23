/**
 * ThryftPerformance — native module contract for on-device performance
 * instrumentation.
 *
 * This file defines the TypeScript surface for the native performance module
 * that bridges:
 *   - **os_signpost** (iOS) / **Trace** (Android) for fine-grained interval
 *     timing via `beginSignpost` / `endSignpost`.
 *   - **Visually-complete + TTI measurement** per surface via
 *     `startSurfaceMeasurement` → `markFirstFrame` → `markInteractive`.
 *   - **MetricKit** (iOS) subscription for crash/hang/hang-rate energy
 *     reports delivered by the OS.
 *   - **Launch metrics** (cold / warm start) captured natively before the JS
 *     bundle is ready.
 *
 * The native implementation lives in the local `thryft-native` Expo module
 * (Swift + Kotlin, Expo Modules API). On platforms where the native module is
 * not linked, `getPerformanceModule()` returns a no-op stub so React
 * components can call the hook unconditionally.
 */

/** The set of instrumented product surfaces. */
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

/** A single surface performance measurement. */
export interface PerfMetric {
  /** The surface that was measured. */
  surface: SurfaceName;
  /** Time-to-first-frame (ms) from measurement start to first rendered frame. */
  ttffMs: number;
  /** Time-to-interactive (ms) from measurement start to interactive. */
  ttiMs: number;
  /** First-input-delay (ms) if an interaction was captured during the window. */
  fidMs: number;
  /** The interaction type that produced the FID (e.g. `tap`, `scroll`). */
  fidType: string;
  /** Epoch timestamp (ms) when the measurement was finalised. */
  timestamp: number;
  /** The session ID returned by `startSurfaceMeasurement`. */
  sessionId: string;
}

/** A MetricKit report delivered by the OS (iOS). */
export interface MetricKitReport {
  /** The MetricKit report type (e.g. `MXAppExitMetric`, `MXAppHangMetric`). */
  reportType: string;
  /** The raw JSON payload from MetricKit. */
  payloadJson: string;
  /** Epoch timestamp (ms) when the report was received. */
  receivedAt: number;
}

/**
 * The native module surface. Every method is async because the underlying
 * platform calls (signposts, MetricKit) are asynchronous.
 */
export interface ThryftPerformanceModule {
  /** Begin an os_signpost / Trace interval. */
  beginSignpost(name: string, message?: string): Promise<void>;
  /** End an os_signpost / Trace interval. */
  endSignpost(name: string, message?: string): Promise<void>;
  /** Start a surface measurement; returns a session ID for subsequent marks. */
  startSurfaceMeasurement(surface: SurfaceName): Promise<string>;
  /** Record the first rendered frame for a surface session. */
  markFirstFrame(sessionId: string): Promise<void>;
  /** Record that the surface became interactive. */
  markInteractive(sessionId: string): Promise<void>;
  /** Read the finalised metrics for a surface session. */
  getMetrics(sessionId: string): Promise<PerfMetric>;
  /** Camera-specific: mark that camera permission was granted for the session. */
  markCameraPermissionGranted(sessionId: string): Promise<void>;
  /** Camera-specific: mark that the camera preview became ready. */
  markCameraReady(sessionId: string): Promise<void>;
  /** Subscribe to MetricKit (iOS) reports. The callback is invoked per report. */
  subscribeToMetricReports(callback: (report: MetricKitReport) => void): Promise<void>;
  /** Read the natively-captured launch metrics (cold / warm start). */
  getLaunchMetrics(): Promise<{ coldStartMs: number; warmStartMs: number }>;
}
