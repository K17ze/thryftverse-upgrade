/**
 * PlaybackClock — the single source of truth for timeline playback time.
 *
 * Per the Zero-Gap audit (09_POSTER_TIMELINE_CAMERA_AUDIO §3), one playback
 * clock must drive: active clip, video seek/play/pause, audio, overlay
 * visibility, text animation, transitions, and keyframes.
 *
 * This class owns the wall-clock time and emits snapshots via a subscriber
 * callback model. It uses `requestAnimationFrame` when available (for smooth
 * 60fps playhead movement) and falls back to `setInterval` on platforms
 * where RAF is not present.
 *
 * Seeks are coalesced: rapid scrub gestures produce time updates on every
 * frame, but the clock throttles native video seek calls to at most once per
 * ~100ms to avoid excessive native bridge traffic (per audit §4).
 *
 * Design references:
 *   - elahlabs/elah PlaybackEngine: anchor-and-integrate clock pattern
 *   - atelier83/timeline: self-driving RAF loop with update(dt)
 *   - expo-video: player.currentTime setter for seeking
 */
import { Platform } from 'react-native';

export interface PlaybackState {
  isPlaying: boolean;
  currentTimeMs: number;
  totalDurationMs: number;
  playbackRate: number;
}

export type PlaybackListener = (state: PlaybackState) => void;

/** Minimum interval between coalesced native seek calls (ms). */
const SEEK_COALESCE_MS = 100;

/** Default RAF interval fallback when requestAnimationFrame is unavailable. */
const FALLBACK_INTERVAL_MS = 1000 / 60;

export class PlaybackClock {
  private _isPlaying = false;
  private _currentTimeMs = 0;
  private _totalDurationMs = 0;
  private _playbackRate = 1;
  private _listeners = new Set<PlaybackListener>();

  // RAF / interval bookkeeping
  private _rafId: number | null = null;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _lastTickMs = 0;

  // Seek coalescing — the last time a native seek was dispatched
  private _lastSeekDispatchMs = 0;
  // Pending seek target that hasn't been dispatched yet (coalesced)
  private _pendingSeekMs: number | null = null;
  // Seek callback registered by the video player adapter
  private _seekCallback: ((timeMs: number) => void) | null = null;

  // Play/pause callback registered by the video player adapter
  private _playCallback: (() => void) | null = null;
  private _pauseCallback: (() => void) | null = null;
  // Rate callback registered by the video player adapter
  private _rateCallback: ((rate: number) => void) | null = null;

  constructor(totalDurationMs = 0) {
    this._totalDurationMs = totalDurationMs;
  }

  // ── State accessors ───────────────────────────────────────────────

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get currentTimeMs(): number {
    return this._currentTimeMs;
  }

  get totalDurationMs(): number {
    return this._totalDurationMs;
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  getSnapshot(): PlaybackState {
    return {
      isPlaying: this._isPlaying,
      currentTimeMs: this._currentTimeMs,
      totalDurationMs: this._totalDurationMs,
      playbackRate: this._playbackRate,
    };
  }

  // ── Subscription ──────────────────────────────────────────────────

  /**
   * Subscribe to playback state changes. The listener is called immediately
   * with the current state, then on every subsequent change.
   *
   * @returns an unsubscribe function.
   */
  subscribe(listener: PlaybackListener): () => void {
    this._listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this._listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this._listeners.forEach((l) => l(snapshot));
  }

  // ── Native adapter registration ───────────────────────────────────

  /**
   * Register callbacks that the clock uses to drive the native video player.
   * These are coalesced / throttled to avoid excessive native bridge calls.
   */
  registerVideoAdapter(adapter: {
    onSeek: (timeMs: number) => void;
    onPlay: () => void;
    onPause: () => void;
    onRateChange?: (rate: number) => void;
  }): void {
    this._seekCallback = adapter.onSeek;
    this._playCallback = adapter.onPlay;
    this._pauseCallback = adapter.onPause;
    this._rateCallback = adapter.onRateChange ?? null;
  }

  unregisterVideoAdapter(): void {
    this._seekCallback = null;
    this._playCallback = null;
    this._pauseCallback = null;
    this._rateCallback = null;
  }

  // ── Transport controls ────────────────────────────────────────────

  play(): void {
    if (this._isPlaying) return;
    this._isPlaying = true;
    this._lastTickMs = performanceNow();
    this.startLoop();
    this._playCallback?.();
    this.emit();
  }

  pause(): void {
    if (!this._isPlaying) return;
    this._isPlaying = false;
    this.stopLoop();
    this._pauseCallback?.();
    this.emit();
  }

  togglePlayPause(): void {
    if (this._isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Seek to an absolute timeline position (ms). The seek is coalesced:
   * the clock updates its internal time immediately (so the UI playhead
   * moves on every frame), but the native video seek is throttled to
   * at most once per SEEK_COALESCE_MS.
   */
  seek(timeMs: number): void {
    const clamped = Math.max(0, Math.min(this._totalDurationMs, timeMs));
    this._currentTimeMs = clamped;
    this.dispatchSeek(clamped);
    this.emit();
  }

  /**
   * Scrub by a relative delta (ms). Used for drag-to-scrub gestures.
   */
  scrubBy(deltaMs: number): void {
    this.seek(this._currentTimeMs + deltaMs);
  }

  setRate(rate: number): void {
    const clamped = Math.max(0.25, Math.min(4, rate));
    this._playbackRate = clamped;
    this._rateCallback?.(clamped);
    this.emit();
  }

  setTotalDurationMs(durationMs: number): void {
    this._totalDurationMs = durationMs;
    // Clamp current time if the timeline shrank
    if (this._currentTimeMs > durationMs) {
      this._currentTimeMs = durationMs;
    }
    this.emit();
  }

  // ── Seek coalescing ───────────────────────────────────────────────

  /**
   * Dispatch a seek to the native video adapter, coalescing rapid calls.
   * The internal time is always updated immediately; only the native call
   * is throttled.
   */
  private dispatchSeek(timeMs: number): void {
    if (!this._seekCallback) return;
    const now = performanceNow();
    const elapsed = now - this._lastSeekDispatchMs;
    if (elapsed >= SEEK_COALESCE_MS) {
      this._lastSeekDispatchMs = now;
      this._pendingSeekMs = null;
      this._seekCallback(timeMs);
    } else {
      // Store the latest target; it will be flushed on the next tick
      this._pendingSeekMs = timeMs;
    }
  }

  /**
   * Flush any pending coalesced seek. Called from the RAF/interval loop.
   */
  private flushPendingSeek(): void {
    if (this._pendingSeekMs === null) return;
    if (!this._seekCallback) {
      this._pendingSeekMs = null;
      return;
    }
    const now = performanceNow();
    const elapsed = now - this._lastSeekDispatchMs;
    if (elapsed >= SEEK_COALESCE_MS) {
      this._lastSeekDispatchMs = now;
      this._seekCallback(this._pendingSeekMs);
      this._pendingSeekMs = null;
    }
  }

  // ── Time advancement loop ─────────────────────────────────────────

  private startLoop(): void {
    this.stopLoop();
    if (canUseRAF()) {
      this._rafId = requestAnimationFrame(this.tick);
    } else {
      this._intervalId = setInterval(this.tick, FALLBACK_INTERVAL_MS);
    }
  }

  private stopLoop(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  /**
   * The tick function advances the clock by the elapsed wall-clock time
   * multiplied by the playback rate. It also flushes any pending coalesced
   * seek.
   */
  private tick = (): void => {
    const now = performanceNow();
    const deltaMs = now - this._lastTickMs;
    this._lastTickMs = now;

    if (this._isPlaying) {
      this._currentTimeMs += deltaMs * this._playbackRate;
      // Loop or stop at the end
      if (this._currentTimeMs >= this._totalDurationMs) {
        this._currentTimeMs = this._totalDurationMs;
        this.pause();
      }
    }

    // Flush any pending coalesced seek
    this.flushPendingSeek();

    this.emit();

    // Schedule the next frame
    if (this._isPlaying) {
      if (canUseRAF()) {
        this._rafId = requestAnimationFrame(this.tick);
      }
      // setInterval doesn't need rescheduling
    }
  };

  // ── Cleanup ───────────────────────────────────────────────────────

  dispose(): void {
    this.stopLoop();
    this._listeners.clear();
    this.unregisterVideoAdapter();
  }
}

// ── Platform helpers ────────────────────────────────────────────────

function performanceNow(): number {
  // React Native provides `performance.now()` on both platforms.
  // Fall back to Date.now() if unavailable.
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function canUseRAF(): boolean {
  // requestAnimationFrame is available in React Native (JS thread) and on web.
  // On some older Android runtimes it may be missing; fall back to setInterval.
  return (
    typeof requestAnimationFrame === 'function' &&
    typeof cancelAnimationFrame === 'function' &&
    Platform.OS !== 'android' // Android RN JS thread RAF can be unreliable; interval is safer
  );
}
