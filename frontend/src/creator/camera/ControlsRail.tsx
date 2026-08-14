import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Type } from '../../theme/designTokens';

const CONTROL_RAIL_ICON = 22;

export type FlashMode = 'off' | 'on' | 'auto';
export type ZoomLevel = 0 | 1 | 2;
export type TimerOption = 0 | 3 | 5 | 10;

export interface ControlsRailProps {
  /** Top offset (safe-area + header clearance) in pixels. */
  top: number;
  /** Whether the visual-search mode is active (hides multi-capture). */
  isVisualSearch: boolean;
  // ── Flip (always visible) ──
  onFlip: () => void;
  // ── Flash (expanded only) ──
  flash: FlashMode;
  onCycleFlash: () => void;
  // ── Zoom (expanded only) ──
  onCycleZoom: () => void;
  zoomLabel: string;
  // ── Timer (expanded only) ──
  onCycleTimer: () => void;
  timerOption: TimerOption;
  // ── Grid (expanded only) ──
  onToggleGrid: () => void;
  showGrid: boolean;
  // ── Multi-capture (expanded only) ──
  onToggleMultiCapture: () => void;
  multiCaptureMode: boolean;
  multiCaptureCount: number;
  hasCapturedUri: boolean;
  // ── Tools disclosure ──
  showTools: boolean;
  onToggleTools: () => void;
  /** Antique-gold accent colour from the active theme. */
  accentColor: string;
}

/**
 * Vertical controls rail — right-side.
 *
 * IDLE (showTools = false): Only Flip + a "More" disclosure button are
 * visible. This keeps the viewfinder dominant — the camera preview is the
 * hero, not a wall of controls.
 *
 * EXPANDED (showTools = true): Flip, Flash, Zoom, Timer, Grid, Multi-capture
 * are revealed. The disclosure button becomes a "Hide" collapse control.
 *
 * Each control is a transparent 48×56 target with a 22pt glyph and a 10pt
 * label — no decorative chrome. Active states (flash, timer, grid,
 * multi-capture) switch to the theme accent colour so the user can read the
 * current toggle state at a glance.
 */
export function ControlsRail({
  top,
  isVisualSearch,
  onFlip,
  flash,
  onCycleFlash,
  onCycleZoom,
  zoomLabel,
  onCycleTimer,
  timerOption,
  onToggleGrid,
  showGrid,
  onToggleMultiCapture,
  multiCaptureMode,
  multiCaptureCount,
  hasCapturedUri,
  showTools,
  onToggleTools,
  accentColor,
}: ControlsRailProps) {
  return (
    <View style={[styles.rail, { top }]} pointerEvents="box-none">
      {/* Flip — always visible (core capture control) */}
      <Pressable
        style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
        onPress={onFlip}
        hitSlop={12}
        accessibilityLabel="Flip camera"
        accessibilityRole="button"
      >
        <Ionicons name="camera-reverse-outline" size={CONTROL_RAIL_ICON} color="#fff" /* Camera overlay — always high contrast on dark preview */ />
        <Text style={styles.railLabel}>Flip</Text>
      </Pressable>

      {/* ── Expanded tools — hidden when idle ── */}
      {showTools && (
        <>
          {/* Flash */}
          <Pressable
            style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
            onPress={onCycleFlash}
            hitSlop={12}
            accessibilityLabel={`Flash ${flash}`}
            accessibilityRole="button"
          >
            <Ionicons
              name={flash === 'off' ? 'flash-off' : flash === 'auto' ? 'flash-outline' : 'flash'}
              size={CONTROL_RAIL_ICON}
              color={flash === 'off' ? '#fff' : accentColor}
            />
            <Text style={styles.railLabel}>{flash === 'off' ? 'Flash' : flash === 'auto' ? 'Auto' : 'On'}</Text>
          </Pressable>

          {/* Zoom */}
          <Pressable
            style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
            onPress={onCycleZoom}
            hitSlop={12}
            accessibilityLabel={`Zoom ${zoomLabel}`}
            accessibilityRole="button"
          >
            <Text style={styles.zoomLabel}>{zoomLabel}</Text>
            <Text style={styles.railLabel}>Zoom</Text>
          </Pressable>

          {/* Timer */}
          <Pressable
            style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
            onPress={onCycleTimer}
            hitSlop={12}
            accessibilityLabel={timerOption === 0 ? 'Timer off' : `Timer ${timerOption} seconds`}
            accessibilityRole="button"
          >
            <Ionicons
              name={timerOption === 0 ? 'timer-outline' : 'timer'}
              size={CONTROL_RAIL_ICON}
              color={timerOption > 0 ? accentColor : '#fff'}
            />
            <Text style={styles.railLabel}>{timerOption === 0 ? 'Timer' : `${timerOption}s`}</Text>
          </Pressable>

          {/* Grid */}
          <Pressable
            style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
            onPress={onToggleGrid}
            hitSlop={12}
            accessibilityLabel={showGrid ? 'Grid on' : 'Grid off'}
            accessibilityRole="button"
          >
            <Ionicons
              name="grid-outline"
              size={CONTROL_RAIL_ICON}
              color={showGrid ? accentColor : '#fff'}
            />
            <Text style={styles.railLabel}>Grid</Text>
          </Pressable>

          {/* Multi-capture (Instagram Layout-style sequential captures) */}
          {!isVisualSearch && (
            <Pressable
              style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
              onPress={onToggleMultiCapture}
              hitSlop={12}
              accessibilityLabel={multiCaptureMode ? 'Multi-capture on' : 'Multi-capture off'}
              accessibilityRole="button"
            >
              <Ionicons
                name={multiCaptureMode ? 'albums' : 'albums-outline'}
                size={CONTROL_RAIL_ICON}
                color={multiCaptureMode ? accentColor : '#fff'}
              />
              <Text style={styles.railLabel}>
                {multiCaptureMode ? `${multiCaptureCount + (hasCapturedUri ? 1 : 0)} photos` : 'Multi'}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {/* Tools disclosure — expands/collapses the advanced controls */}
      <Pressable
        style={({ pressed }) => [styles.railBtn, pressed && styles.btnPressed]}
        onPress={onToggleTools}
        hitSlop={12}
        accessibilityLabel={showTools ? 'Hide tools' : 'Show tools'}
        accessibilityRole="button"
      >
        <Ionicons
          name={showTools ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={CONTROL_RAIL_ICON}
          color={showTools ? accentColor : '#fff'}
        />
        <Text style={styles.railLabel}>{showTools ? 'Hide' : 'More'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Camera overlay — always high contrast on dark preview. The theme has no
  // `textOnMedia` token; textPrimary resolves to black in light mode
  // (invisible on the dark camera preview), so overlay whites are retained.
  rail: {
    position: 'absolute',
    right: 8,
    gap: 16,
    alignItems: 'center',
  },
  // 44pt minimum touch target (AGENTS.md §13). The visible glyph is 22pt
  // but the hit zone is 48×56 to exceed the minimum. Labels are 10pt to
  // keep the rail compact — the viewfinder dominates, not the controls.
  railBtn: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  railLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
  },
  zoomLabel: {
    fontFamily: Typography.family.bold,
    fontSize: Type.body.size,
    color: '#fff',
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
