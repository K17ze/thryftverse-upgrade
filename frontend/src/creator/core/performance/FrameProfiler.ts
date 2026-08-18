/**
 * FrameProfiler — frame-level performance profiler for the creator canvas.
 *
 * Tracks real frame render times using a ring buffer for efficient storage.
 * Three timing sources are captured:
 *
 *   1. **Canvas render times** — wall-clock ms spent in the canvas render
 *      path, measured by the caller around the render work.
 *   2. **JS thread frame times** — inter-frame deltas on the JS thread via
 *      `performance.now()`, measuring how long the JS thread takes between
 *      frames (the inverse of JS FPS).
 *   3. **UI thread frame times** — inter-frame deltas measured inside a
 *      Reanimated `useFrameCallback` worklet (runs on the UI thread),
 *      giving the true display refresh cadence.
 *
 * All measurements are **real** — no estimates, no synthetic data
 * (AGENTS.md §11: truthful UI, no fake metrics).
 *
 * The profiler computes rolling averages over the last 60 frames (≈1 second
 * at 60fps), detects dropped frames (frame time > 1000/60 ≈ 16.67ms), and
 * derives a jank score (0–100, higher = worse) from the proportion of
 * dropped frames and the variance of frame times.
 *
 * Usage:
 *   const profiler = FrameProfiler.getInstance();
 *   profiler.setEnabled(true);
 *   // In a useFrameCallback worklet:
 *   profiler.recordUIThreadFrame(deltaMs);
 *   // On the JS thread:
 *   profiler.recordJSThreadFrame(deltaMs);
 *   profiler.recordCanvasRender(renderMs);
 *   const metrics = profiler.getMetrics();
 */

// ── Types ──────────────────────────────────────────────────────────────

/** Rolling-window performance metrics derived from the ring buffer. */
export interface FrameMetrics {
  /** Average frame time over the last 60 frames (ms). */
  avgFrameTime: number;
  /** Current frames-per-second derived from avgFrameTime (capped at 120). */
  fps: number;
  /** Number of dropped frames (frame time > 16.67ms) in the current window. */
  droppedFrames: number;
  /** Jank score 0–100 (higher = worse). Derived from drop ratio + variance. */
  jankScore: number;
  /** Average UI-thread frame time (ms), or 0 if not measured. */
  avgUIThreadFrameTime: number;
  /** Average JS-thread frame time (ms), or 0 if not measured. */
  avgJSThreadFrameTime: number;
  /** Average canvas render time (ms), or 0 if not measured. */
  avgCanvasRenderTime: number;
  /** Total frames recorded since the last reset. */
  totalFrames: number;
}

// ── Constants ──────────────────────────────────────────────────────────

/** Target frame budget for 60fps in milliseconds. */
export const TARGET_FRAME_MS = 1000 / 60; // ≈ 16.67ms

/** Number of frames stored in the ring buffer (≈1s at 60fps). */
const RING_BUFFER_SIZE = 60;

/** Frame time threshold above which a frame is considered "dropped". */
const DROP_THRESHOLD_MS = TARGET_FRAME_MS * 1.5; // 25ms — 1.5x budget

// ── RingBuffer ─────────────────────────────────────────────────────────

/**
 * Fixed-capacity ring buffer for O(1) append and rolling-average computation.
 * Avoids array growth / GC pressure during continuous profiling.
 */
class RingBuffer {
  private readonly buffer: Float32Array;
  private head = 0;
  private _size = 0;
  private _sum = 0;

  constructor(capacity: number) {
    this.buffer = new Float32Array(capacity);
  }

  /** Append a value, evicting the oldest if the buffer is full. */
  push(value: number): void {
    const capacity = this.buffer.length;
    if (this._size === capacity) {
      // Evict oldest value from the running sum
      this._sum -= this.buffer[this.head]!;
    } else {
      this._size++;
    }
    this.buffer[this.head] = value;
    this._sum += value;
    this.head = (this.head + 1) % capacity;
  }

  /** Current number of stored values (0..capacity). */
  get size(): number {
    return this._size;
  }

  /** Sum of all stored values. */
  get sum(): number {
    return this._sum;
  }

  /** Arithmetic mean of stored values, or 0 if empty. */
  average(): number {
    if (this._size === 0) return 0;
    return this._sum / this._size;
  }

  /**
   * Population standard deviation of stored values.
   * Used for jank-score variance computation.
   */
  stdDev(): number {
    if (this._size < 2) return 0;
    const avg = this.average();
    let acc = 0;
    for (let i = 0; i < this._size; i++) {
      const idx = (this.head - this._size + i + this.buffer.length) % this.buffer.length;
      const diff = this.buffer[idx]! - avg;
      acc += diff * diff;
    }
    return Math.sqrt(acc / this._size);
  }

  /** Count values that exceed the given threshold. */
  countAbove(threshold: number): number {
    let count = 0;
    for (let i = 0; i < this._size; i++) {
      const idx = (this.head - this._size + i + this.buffer.length) % this.buffer.length;
      if (this.buffer[idx]! > threshold) count++;
    }
    return count;
  }

  /** Returns a copy of stored values in insertion order (oldest first). */
  toArray(): number[] {
    const result: number[] = [];
    for (let i = 0; i < this._size; i++) {
      const idx = (this.head - this._size + i + this.buffer.length) % this.buffer.length;
      result.push(this.buffer[idx]!);
    }
    return result;
  }

  /** Reset the buffer to empty. */
  clear(): void {
    this.head = 0;
    this._size = 0;
    this._sum = 0;
  }
}

// ── FrameProfiler ──────────────────────────────────────────────────────

/**
 * Singleton frame profiler. Uses a singleton so that worklet code and
 * JS-thread code can both write to the same instance via runOnJS bridges.
 *
 * Thread safety note: Reanimated worklets run on the UI thread. When the
 * worklet needs to record a UI-thread frame, it calls `runOnJS` to bridge
 * the measurement to the JS thread, where the profiler instance lives.
 * This avoids shared-memory races while keeping the measurement real.
 */
export class FrameProfiler {
  private static _instance: FrameProfiler | null = null;

  static getInstance(): FrameProfiler {
    if (FrameProfiler._instance === null) {
      FrameProfiler._instance = new FrameProfiler();
    }
    return FrameProfiler._instance;
  }

  // Private — use getInstance()
  private constructor() {}

  // Ring buffers for each timing source
  private readonly uiThreadFrames = new RingBuffer(RING_BUFFER_SIZE);
  private readonly jsThreadFrames = new RingBuffer(RING_BUFFER_SIZE);
  private readonly canvasRenderTimes = new RingBuffer(RING_BUFFER_SIZE);

  // Counters
  private _enabled = false;
  private _totalFrames = 0;

  // ── Enable / disable ────────────────────────────────────────────────

  /** Whether profiling is currently active. When false, records are ignored. */
  get enabled(): boolean {
    return this._enabled;
  }

  /** Enable or disable profiling. Disabling does not clear existing data. */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  // ── Recording ───────────────────────────────────────────────────────

  /**
   * Record a UI-thread frame delta (ms). Called from JS after bridging
   * from a Reanimated useFrameCallback worklet via runOnJS.
   */
  recordUIThreadFrame(deltaMs: number): void {
    if (!this._enabled || deltaMs <= 0 || deltaMs > 1000) return;
    this.uiThreadFrames.push(deltaMs);
    this._totalFrames++;
  }

  /**
   * Record a JS-thread frame delta (ms). Measured as the time between
   * successive JS-thread ticks (e.g. via requestAnimationFrame or
   * setInterval on the JS thread).
   */
  recordJSThreadFrame(deltaMs: number): void {
    if (!this._enabled || deltaMs <= 0 || deltaMs > 1000) return;
    this.jsThreadFrames.push(deltaMs);
  }

  /**
   * Record a canvas render time (ms). The caller measures the wall-clock
   * time spent in the canvas render path and passes it here.
   */
  recordCanvasRender(renderMs: number): void {
    if (!this._enabled || renderMs < 0) return;
    this.canvasRenderTimes.push(renderMs);
  }

  // ── Metrics ─────────────────────────────────────────────────────────

  /**
   * Compute current rolling metrics from the ring buffers.
   *
   * The primary frame-time source is the UI-thread buffer (true display
   * cadence). If the UI-thread buffer is empty, falls back to the JS-thread
   * buffer. If both are empty, returns zeroed metrics.
   */
  getMetrics(): FrameMetrics {
    const primary = this.uiThreadFrames.size > 0 ? this.uiThreadFrames : this.jsThreadFrames;

    if (primary.size === 0) {
      return {
        avgFrameTime: 0,
        fps: 0,
        droppedFrames: 0,
        jankScore: 0,
        avgUIThreadFrameTime: this.uiThreadFrames.average(),
        avgJSThreadFrameTime: this.jsThreadFrames.average(),
        avgCanvasRenderTime: this.canvasRenderTimes.average(),
        totalFrames: this._totalFrames,
      };
    }

    const avgFrameTime = primary.average();
    const fps = avgFrameTime > 0 ? Math.min(120, Math.round(1000 / avgFrameTime)) : 0;
    const droppedFrames = primary.countAbove(DROP_THRESHOLD_MS);

    // Jank score: weighted combination of drop ratio and frame-time variance.
    //   dropRatio (0..1) → 0..70 points
    //   varianceScore (0..1) → 0..30 points
    // Higher = worse jank. Clamped to 0..100.
    const dropRatio = primary.size > 0 ? droppedFrames / primary.size : 0;
    const stdDev = primary.stdDev();
    // Normalize stdDev: a stdDev of TARGET_FRAME_MS or more is "very janky"
    const varianceScore = Math.min(1, stdDev / TARGET_FRAME_MS);
    const jankScore = Math.round(Math.min(100, dropRatio * 70 + varianceScore * 30));

    return {
      avgFrameTime,
      fps,
      droppedFrames,
      jankScore,
      avgUIThreadFrameTime: this.uiThreadFrames.average(),
      avgJSThreadFrameTime: this.jsThreadFrames.average(),
      avgCanvasRenderTime: this.canvasRenderTimes.average(),
      totalFrames: this._totalFrames,
    };
  }

  /**
   * Returns the raw frame-time history (oldest first) for graph rendering.
   * Uses the UI-thread buffer if available, otherwise the JS-thread buffer.
   */
  getFrameHistory(): number[] {
    if (this.uiThreadFrames.size > 0) return this.uiThreadFrames.toArray();
    return this.jsThreadFrames.toArray();
  }

  // ── Reset ───────────────────────────────────────────────────────────

  /** Clear all recorded data and reset counters. */
  reset(): void {
    this.uiThreadFrames.clear();
    this.jsThreadFrames.clear();
    this.canvasRenderTimes.clear();
    this._totalFrames = 0;
  }
}
