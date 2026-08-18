/**
 * PerformanceOverlay — debug-only performance overlay for the creator canvas.
 *
 * Renders a semi-transparent panel at the top-right of the screen showing:
 *   - Current FPS (large number)
 *   - Frame-time bar chart (last 60 frames, rendered via Skia)
 *   - Dropped frame count
 *   - Jank score (0–100, higher = worse)
 *   - Memory usage (if available)
 *   - Toggle button to enable/disable profiling
 *
 * The overlay is only rendered in __DEV__ mode. The panel itself is
 * non-interactive (pointerEvents="none") except for the toggle button,
 * so it does not interfere with canvas gestures.
 *
 * Per AGENTS.md §11: all displayed metrics are real measurements from
 * FrameProfiler — no fabricated or estimated values.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Canvas, Rect, Line, Text as SkiaText, useFont } from '@shopify/react-native-skia';
import { FrameProfiler, TARGET_FRAME_MS, type FrameMetrics } from './FrameProfiler';

// ── Constants ──────────────────────────────────────────────────────────

const OVERLAY_WIDTH = 180;
const OVERLAY_HEIGHT = 220;
const GRAPH_HEIGHT = 60;
const GRAPH_BAR_WIDTH = OVERLAY_WIDTH - 24; // padding
const GRAPH_BAR_GAP = 1;
const MAX_BAR_HEIGHT = GRAPH_HEIGHT - 4;
const UPDATE_INTERVAL_MS = 250; // 4 updates/sec — enough for readability

// ── Props ──────────────────────────────────────────────────────────────

export interface PerformanceOverlayProps {
  /** Override the profiler instance (defaults to the singleton). */
  profiler?: FrameProfiler;
  /** Whether the overlay is initially visible. Default true in __DEV__. */
  defaultVisible?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────

export function PerformanceOverlay({
  profiler = FrameProfiler.getInstance(),
  defaultVisible = true,
}: PerformanceOverlayProps) {
  // This entire component is dev-only. The parent should gate on __DEV__,
  // but we also guard here so the overlay is never rendered in production.
  if (!__DEV__) return null;

  return <OverlayInner profiler={profiler} defaultVisible={defaultVisible} />;
}

// Split into an inner component so the __DEV__ guard short-circuits before
// any hooks are called (React rules of hooks: the guard must be above all
// hooks, which it is in PerformanceOverlay — the inner component always
// mounts its hooks).
function OverlayInner({
  profiler,
  defaultVisible,
}: {
  profiler: FrameProfiler;
  defaultVisible: boolean;
}) {
  const [visible, setVisible] = useState(defaultVisible);
  const [profilingEnabled, setProfilingEnabled] = useState(profiler.enabled);
  const [metrics, setMetrics] = useState<FrameMetrics>(profiler.getMetrics());
  const [frameHistory, setFrameHistory] = useState<number[]>([]);
  const [memoryUsage, setMemoryUsage] = useState<number | null>(null);

  // ── Poll metrics ────────────────────────────────────────────────────
  // We poll at 4Hz rather than on every frame to avoid React re-renders
  // perturbing the very metrics we're measuring.
  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      const m = profiler.getMetrics();
      setMetrics(m);
      setFrameHistory(profiler.getFrameHistory());
      // Memory: try performance.memory (Chrome / Hermes dev tools bridge).
      // Not available on all platforms — we show "N/A" when absent.
      try {
        const perf = globalThis as unknown as {
          performance?: {
            memory?: { usedJSHeapSize?: number };
          };
        };
        const mem = perf.performance?.memory?.usedJSHeapSize;
        setMemoryUsage(mem != null ? mem / (1024 * 1024) : null);
      } catch {
        setMemoryUsage(null);
      }
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [visible, profiler]);

  // ── Toggle profiling ────────────────────────────────────────────────
  const toggleProfiling = useCallback(() => {
    const next = !profilingEnabled;
    profiler.setEnabled(next);
    setProfilingEnabled(next);
    if (!next) {
      profiler.reset();
      setMetrics(profiler.getMetrics());
      setFrameHistory([]);
    }
  }, [profiler, profilingEnabled]);

  // ── FPS color ───────────────────────────────────────────────────────
  const fpsColor = useMemo(() => {
    if (metrics.fps >= 58) return '#10B981'; // green
    if (metrics.fps >= 45) return '#F59E0B'; // amber
    return '#EF4444'; // red
  }, [metrics.fps]);

  const jankColor = useMemo(() => {
    if (metrics.jankScore <= 20) return '#10B981';
    if (metrics.jankScore <= 50) return '#F59E0B';
    return '#EF4444';
  }, [metrics.jankScore]);

  if (!visible) {
    // Collapsed: show a small toggle button to re-expand
    return (
      <View style={styles.collapsedContainer} pointerEvents="box-none">
        <Pressable
          onPress={() => setVisible(true)}
          style={styles.toggleBtn}
          accessibilityLabel="Show performance overlay"
          accessibilityRole="button"
        >
          <Text style={styles.toggleBtnText}>PERF</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.panel}>
        {/* Toggle button — the only interactive element */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>Performance</Text>
          <View style={styles.headerBtns}>
            <Pressable
              onPress={toggleProfiling}
              style={[styles.miniBtn, profilingEnabled && styles.miniBtnActive]}
              accessibilityLabel={
                profilingEnabled ? 'Pause profiling' : 'Start profiling'
              }
              accessibilityRole="button"
            >
              <Text style={styles.miniBtnText}>
                {profilingEnabled ? '⏸' : '▶'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setVisible(false)}
              style={styles.miniBtn}
              accessibilityLabel="Hide performance overlay"
              accessibilityRole="button"
            >
              <Text style={styles.miniBtnText}>✕</Text>
            </Pressable>
          </View>
        </View>

        {/* FPS — large number */}
        <View style={styles.fpsRow}>
          <Text style={[styles.fpsValue, { color: fpsColor }]}>
            {metrics.fps}
          </Text>
          <Text style={styles.fpsUnit}>fps</Text>
        </View>

        {/* Frame-time bar chart (Skia) */}
        <View style={styles.graphContainer}>
          <SkiaFrameGraph
            frameHistory={frameHistory}
            width={GRAPH_BAR_WIDTH}
            height={GRAPH_HEIGHT}
            targetMs={TARGET_FRAME_MS}
          />
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <Stat label="Frame" value={`${metrics.avgFrameTime.toFixed(1)}ms`} />
          <Stat label="Dropped" value={String(metrics.droppedFrames)} />
        </View>
        <View style={styles.statsRow}>
          <Stat
            label="Jank"
            value={String(metrics.jankScore)}
            color={jankColor}
          />
          <Stat
            label="Memory"
            value={memoryUsage != null ? `${memoryUsage.toFixed(0)}MB` : 'N/A'}
          />
        </View>

        {/* Sub-label for thread breakdown */}
        <View style={styles.threadRow}>
          <Text style={styles.threadLabel}>
            UI: {metrics.avgUIThreadFrameTime.toFixed(1)}ms · JS:{' '}
            {metrics.avgJSThreadFrameTime.toFixed(1)}ms · Canvas:{' '}
            {metrics.avgCanvasRenderTime.toFixed(1)}ms
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Stat sub-component ─────────────────────────────────────────────────

function Stat({
  label,
  value,
  color = '#FFFFFF',
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

// ── Skia frame-time bar chart ──────────────────────────────────────────

/**
 * Renders the last N frame times as vertical bars using Skia.
 * Bars exceeding the 60fps budget are drawn red; others are green.
 * A horizontal line marks the 16.67ms target.
 */
function SkiaFrameGraph({
  frameHistory,
  width,
  height,
  targetMs,
}: {
  frameHistory: number[];
  width: number;
  height: number;
  targetMs: number;
}) {
  // Skia font for the "60fps" label — use a safe default. If the font
  // fails to load, the label is simply omitted (the bars still render).
  const font = useFont(null, 9);

  const bars = useMemo(() => {
    const count = frameHistory.length;
    if (count === 0) return [];
    const barW = Math.max(1, width / count - GRAPH_BAR_GAP);
    const maxFrameMs = Math.max(targetMs * 2, ...frameHistory); // scale to 2x budget or max
    const scale = MAX_BAR_HEIGHT / maxFrameMs;

    return frameHistory.map((frameMs, i) => {
      const barH = Math.max(1, frameMs * scale);
      const x = i * (barW + GRAPH_BAR_GAP);
      const y = height - barH;
      const isDropped = frameMs > targetMs * 1.5;
      return { x, y, w: barW, h: barH, isDropped };
    });
  }, [frameHistory, width, height, targetMs]);

  // Target line Y position (16.67ms line)
  const maxFrameMs = Math.max(targetMs * 2, ...frameHistory, 1);
  const scale = MAX_BAR_HEIGHT / maxFrameMs;
  const targetY = height - targetMs * scale;

  return (
    <Canvas style={{ width, height }}>
      {/* Bars */}
      {bars.map((bar, i) => (
        <Rect
          key={i}
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          color={bar.isDropped ? '#EF4444' : '#10B981'}
          opacity={0.85}
        />
      ))}
      {/* Target line (60fps budget) */}
      <Line
        p1={{ x: 0, y: targetY }}
        p2={{ x: width, y: targetY }}
        color="#FFFFFF"
        strokeWidth={0.5}
        opacity={0.4}
      />
      {/* Label */}
      {font && (
        <SkiaText
          x={width - 40}
          y={targetY - 2}
          text="60fps"
          font={font}
          color="#FFFFFF99"
        />
      )}
    </Canvas>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.select({ ios: 60, android: 50 }),
    right: 8,
    zIndex: 9999,
    elevation: 9999,
  },
  collapsedContainer: {
    position: 'absolute',
    top: Platform.select({ ios: 60, android: 50 }),
    right: 8,
    zIndex: 9999,
    elevation: 9999,
  },
  panel: {
    width: OVERLAY_WIDTH,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    padding: 8,
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headerBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  miniBtn: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
  },
  miniBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  fpsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  fpsValue: {
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  fpsUnit: {
    color: '#FFFFFF80',
    fontSize: 12,
    fontWeight: '500',
  },
  graphContainer: {
    marginVertical: 2,
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statLabel: {
    color: '#FFFFFF60',
    fontSize: 9,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  threadRow: {
    marginTop: 2,
  },
  threadLabel: {
    color: '#FFFFFF50',
    fontSize: 8,
    fontVariant: ['tabular-nums'],
  },
  toggleBtn: {
    width: 44,
    height: 24,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
