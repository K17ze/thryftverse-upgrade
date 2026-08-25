/**
 * QoE (Quality of Experience) telemetry event schema for video playback.
 *
 * These types define the contract between the VideoManager's QoECollector
 * and the analytics layer (PostHog). A `VideoQoESession` is emitted when
 * a player slot finalizes — either because the item scrolled out of the
 * active viewport, the player was reused for a different item, or the app
 * was backgrounded.
 *
 * Industry-standard metric families (verified against Mux, FastPix,
 * HeadSpin, OpenTelemetry — Aug 2026):
 *   1. Startup: TTFF, startup failure, exit-before-first-frame
 *   2. Rebuffering: rebuffer count, total stall time, rebuffer ratio
 *   3. Quality: bitrate switches, average delivered bitrate
 *   4. Playback smoothness: (dropped frames — not available in expo-video)
 *   5. Engagement: watch duration, completion rate, play/pause/seek/loop
 *   6. Errors: decoder errors, startup failure
 *
 * Alert thresholds (FastPix 2026):
 *   VST (TTFF) < 2,000ms good, > 4,000ms poor
 *   rebuffer_ratio < 0.005 (0.5%) good, > 0.05 (5%) poor
 *   error_rate < 0.005 good
 *   exit_before_first_frame < 0.05 (5%) good
 */

export type VideoSurface =
  | 'feed'
  | 'product_detail'
  | 'look_detail'
  | 'profile_cover'
  | 'fullscreen_viewer'
  | 'creator_canvas'
  | 'poster_story';

export type SlotRole = 'active' | 'prewarm';

export interface VideoQoESession {
  // ── Identity ──
  sessionId: string;
  videoId: string;
  sourceUri: string;
  surface: VideoSurface;

  // ── Startup ──
  /** Time to First Frame: play() call → first playingChange=true (ms). */
  timeToFirstFrameMs: number | null;
  /** statusChange=error before first frame. */
  startupFailure: boolean;
  /** User navigated away before first frame rendered. */
  exitBeforeFirstFrame: boolean;

  // ── Rebuffering ──
  rebufferCount: number;
  rebufferTotalMs: number;
  /** rebufferTotalMs / watchDurationMs (0–1). */
  rebufferRatio: number;
  /** rebufferCount / watchDurationMinutes. */
  rebufferFrequency: number;

  // ── Quality / ABR ──
  bitrateSwitchCount: number;
  avgDeliveredBitrate: number | null;
  startupRendition: string | null;
  finalRendition: string | null;
  renditionLadder: string[];

  // ── Engagement ──
  watchDurationMs: number;
  /** watchDuration / duration (0–1). */
  completionRate: number;
  playCount: number;
  pauseCount: number;
  seekCount: number;
  loopCount: number;

  // ── Cache / network ──
  cacheHit: boolean;
  networkType: string;

  // ── Device / context ──
  deviceTier: string;
  platform: string;
  appVersion: string;
  timestamp: number;

  // ── Pool metadata ──
  poolRole: SlotRole;
  wasPrewarmed: boolean;
  /** Time from prewarm start → active play (ms), if this session was prewarmed. */
  prewarmToActiveMs: number | null;
}

/**
 * Real-time event emitted during playback (for live dashboards).
 * These are fire-and-forget events; the session is the authoritative record.
 */
export interface VideoQoELiveEvent {
  sessionId: string;
  videoId: string;
  eventType:
    | 'play_request'
    | 'first_frame'
    | 'rebuffer_start'
    | 'rebuffer_end'
    | 'bitrate_switch'
    | 'play_to_end'
    | 'error'
    | 'user_exit';
  timestamp: number;
  currentTimeSec: number;
  bufferedPositionSec: number;
  rendition?: string;
  bitrate?: number;
  errorMessage?: string;
}
