/**
 * CaptureToolsSheet — bottom sheet containing the secondary camera tools.
 *
 * The default camera chrome shows only the essential capture controls
 * (Close, Flash, Gallery, Shutter, Flip, mode switch, zoom indicator).
 * Everything else lives here, behind a "Tools" button in the top bar:
 *
 *   - Timer (Off / 3s / 5s / 10s) — selectable chips
 *   - Grid overlay toggle
 *   - Hands-free capture toggle
 *   - Speed mode selector (0.3× / 1× / 2× / 3×)
 *   - Green screen (opens GreenScreenSheet)
 *   - Camera effects (expands to show CameraEffectBar inline)
 *   - Multi-capture toggle
 *
 * Each row is a 44pt+ touch target with an icon, label, and toggle/value.
 * Haptics fire on every interaction. Uses SheetContainer for the animated
 * bottom-sheet presentation (slide-up spring + backdrop fade).
 *
 * Per AGENTS.md §4: flat canvas, spacing, and hairlines — no card-on-card.
 * Per AGENTS.md §11: truthful UI — every toggle reflects real state.
 * Per AGENTS.md §13: 44pt touch targets, selected state uses shape.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Space,
  Radius,
  Type,
  FontFamily,
  Control,
  Stroke,
} from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../CreatorAnimations';
import { CreatorSegmentControl } from '../controls/CreatorSegmentControl';
import { CameraEffectBar, type CameraEffectId } from './CameraEffectBar';
import { useHaptic } from '../../hooks/useHaptic';

// ── Types ──────────────────────────────────────────────────────────

export type TimerOption = 0 | 3 | 5 | 10;

export interface CaptureToolsSheetProps {
  visible: boolean;
  onClose: () => void;
  // ── Timer ──
  timerOption: TimerOption;
  onTimerChange: (option: TimerOption) => void;
  // ── Grid ──
  showGrid: boolean;
  onToggleGrid: () => void;
  // ── Hands-free ──
  handsFreeMode: boolean;
  onToggleHandsFree: () => void;
  // ── Speed ──
  speedMode: string;
  onSpeedChange: (value: string) => void;
  // ── Green screen ──
  greenScreenActive: boolean;
  onOpenGreenScreen: () => void;
  // ── Camera effects ──
  cameraEffect: CameraEffectId;
  onSelectEffect: (effect: CameraEffectId) => void;
  // ── Multi-capture ──
  multiCaptureMode: boolean;
  onToggleMultiCapture: () => void;
  multiCaptureCount: number;
  hasCapturedUri: boolean;
  // ── Mode gating ──
  isVisualSearch: boolean;
  // ── Recording state (disables some tools while recording) ──
  isRecording: boolean;
}

// ── Constants ──────────────────────────────────────────────────────

const TIMER_OPTIONS: Array<{ label: string; value: TimerOption }> = [
  { label: 'Off', value: 0 },
  { label: '3s', value: 3 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
];

const SPEED_MODES = [
  { label: '0.3×', value: '0.3' },
  { label: '1×', value: '1' },
  { label: '2×', value: '2' },
  { label: '3×', value: '3' },
];

const ROW_HEIGHT = 52; // ≥44pt touch target
const ICON_SIZE = 22;
const ROW_ICON_SIZE = 20;

// ── Component ──────────────────────────────────────────────────────

export function CaptureToolsSheet({
  visible,
  onClose,
  timerOption,
  onTimerChange,
  showGrid,
  onToggleGrid,
  handsFreeMode,
  onToggleHandsFree,
  speedMode,
  onSpeedChange,
  greenScreenActive,
  onOpenGreenScreen,
  cameraEffect,
  onSelectEffect,
  multiCaptureMode,
  onToggleMultiCapture,
  multiCaptureCount,
  hasCapturedUri,
  isVisualSearch,
  isRecording,
}: CaptureToolsSheetProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useSheetStyles(colors);

  // Effects section expand/collapse state
  const [effectsExpanded, setEffectsExpanded] = useState(false);

  const handleClose = useCallback(() => {
    haptic.light();
    onClose();
  }, [haptic, onClose]);

  const handleTimerSelect = useCallback(
    (option: TimerOption) => {
      haptic.selection();
      onTimerChange(option);
    },
    [haptic, onTimerChange],
  );

  const handleGridToggle = useCallback(() => {
    haptic.selection();
    onToggleGrid();
  }, [haptic, onToggleGrid]);

  const handleHandsFreeToggle = useCallback(() => {
    haptic.selection();
    onToggleHandsFree();
  }, [haptic, onToggleHandsFree]);

  const handleSpeedChange = useCallback(
    (value: string) => {
      haptic.selection();
      onSpeedChange(value);
    },
    [haptic, onSpeedChange],
  );

  const handleGreenScreenOpen = useCallback(() => {
    haptic.selection();
    onOpenGreenScreen();
  }, [haptic, onOpenGreenScreen]);

  const handleEffectsToggle = useCallback(() => {
    haptic.selection();
    setEffectsExpanded((p) => !p);
  }, [haptic]);

  const handleMultiCaptureToggle = useCallback(() => {
    haptic.selection();
    onToggleMultiCapture();
  }, [haptic, onToggleMultiCapture]);

  // Tools that are not applicable in visual-search mode
  const showMultiCapture = !isVisualSearch;
  const showHandsFree = !isVisualSearch;
  const showGreenScreen = !isVisualSearch;
  const showEffects = !isVisualSearch;
  const showSpeed = !isVisualSearch;

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Tools</Text>
          <PressScale
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityLabel="Close tools sheet"
            accessibilityHint="Closes the camera tools sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>

        {/* ── Timer ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.rowLabelWrap}>
            <Ionicons name="timer-outline" size={ROW_ICON_SIZE} color={colors.textSecondary} />
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Timer</Text>
          </View>
          <View style={styles.chipRow}>
            {TIMER_OPTIONS.map((opt) => {
              const isActive = timerOption === opt.value;
              return (
                <PressScale
                  key={opt.value}
                  onPress={() => handleTimerSelect(opt.value)}
                  style={styles.chip}
                  accessibilityLabel={`Timer ${opt.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isActive ? colors.brand : colors.textSecondary,
                        textDecorationLine: isActive ? 'underline' : 'none',
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </PressScale>
              );
            })}
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

        {/* ── Grid ────────────────────────────────────────────────── */}
        <ToggleRow
          icon="grid-outline"
          label="Grid"
          active={showGrid}
          onPress={handleGridToggle}
          colors={colors}
          styles={styles}
        />

        {/* ── Hands-free ──────────────────────────────────────────── */}
        {showHandsFree && (
          <ToggleRow
            icon="hand-right-outline"
            label="Hands-free"
            active={handsFreeMode}
            onPress={handleHandsFreeToggle}
            colors={colors}
            styles={styles}
            disabled={isRecording}
          />
        )}

        {/* ── Speed ───────────────────────────────────────────────── */}
        {showSpeed && (
          <View style={styles.section}>
            <View style={styles.rowLabelWrap}>
              <Ionicons name="speedometer-outline" size={ROW_ICON_SIZE} color={colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Speed</Text>
            </View>
            <View style={styles.segmentWrap}>
              <CreatorSegmentControl
                segments={SPEED_MODES.map((s) => ({ label: s.label, value: s.value }))}
                value={speedMode}
                onChange={handleSpeedChange}
                testID="capture-tools-speed-control"
              />
            </View>
          </View>
        )}

        {/* ── Green screen ────────────────────────────────────────── */}
        {showGreenScreen && (
          <NavRow
            icon={greenScreenActive ? 'color-fill' : 'color-fill-outline'}
            label="Green Screen"
            value={greenScreenActive ? 'On' : 'Off'}
            active={greenScreenActive}
            onPress={handleGreenScreenOpen}
            colors={colors}
            styles={styles}
            disabled={isRecording}
          />
        )}

        {/* ── Camera effects ──────────────────────────────────────── */}
        {showEffects && (
          <View style={styles.section}>
            <PressScale
              onPress={handleEffectsToggle}
              style={styles.navRowInner}
              accessibilityLabel="Camera effects"
              accessibilityHint="Expands to show camera effect options"
              accessibilityRole="button"
              disabled={isRecording}
            >
              <View style={styles.rowLabelWrap}>
                <Ionicons
                  name="color-palette-outline"
                  size={ROW_ICON_SIZE}
                  color={cameraEffect !== 'none' ? colors.brand : colors.textSecondary}
                />
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                  Effects
                </Text>
              </View>
              <View style={styles.navRight}>
                <Text style={[styles.navValue, { color: colors.textSecondary }]}>
                  {cameraEffect === 'none' ? 'None' : cameraEffect.charAt(0).toUpperCase() + cameraEffect.slice(1)}
                </Text>
                <Ionicons
                  name={effectsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textMuted}
                />
              </View>
            </PressScale>
            {effectsExpanded && (
              <View style={styles.effectsExpand}>
                <CameraEffectBar
                  activeEffect={cameraEffect}
                  onSelectEffect={onSelectEffect}
                  disabled={isRecording}
                />
              </View>
            )}
          </View>
        )}

        {/* ── Multi-capture ───────────────────────────────────────── */}
        {showMultiCapture && (
          <ToggleRow
            icon={multiCaptureMode ? 'albums' : 'albums-outline'}
            label="Multi-capture"
            description={
              multiCaptureMode
                ? `${multiCaptureCount + (hasCapturedUri ? 1 : 0)} photo${multiCaptureCount + (hasCapturedUri ? 1 : 0) !== 1 ? 's' : ''} selected`
                : undefined
            }
            active={multiCaptureMode}
            onPress={handleMultiCaptureToggle}
            colors={colors}
            styles={styles}
          />
        )}
      </ScrollView>
    </SheetContainer>
  );
}

// ── ToggleRow (inline component for simple on/off rows) ────────────

interface ToggleRowProps {
  icon: string;
  label: string;
  description?: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof useSheetStyles>;
  disabled?: boolean;
}

function ToggleRow({
  icon,
  label,
  description,
  active,
  onPress,
  colors,
  styles,
  disabled,
}: ToggleRowProps): React.ReactElement {
  return (
    <PressScale
      onPress={onPress}
      style={styles.toggleRow}
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: disabled || undefined }}
      disabled={disabled}
    >
      <View style={styles.rowLabelWrap}>
        <Ionicons
          name={icon as React.ComponentProps<typeof Ionicons>['name']}
          size={ROW_ICON_SIZE}
          color={active ? colors.brand : colors.textSecondary}
        />
        <View style={styles.rowTextWrap}>
          <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
          {description ? (
            <Text style={[styles.rowHint, { color: colors.textMuted }]} numberOfLines={1}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      {/* Toggle switch — truthful state indicator */}
      <View
        style={[
          styles.toggleTrack,
          { backgroundColor: active ? colors.brand : colors.surfaceAlt },
        ]}
      >
        <View
          style={[
            styles.toggleThumb,
            { backgroundColor: active ? colors.surface : colors.textMuted },
            active && styles.toggleThumbActive,
          ]}
        />
      </View>
    </PressScale>
  );
}

// ── NavRow (inline component for rows that navigate/open sub-sheets) ──

interface NavRowProps {
  icon: string;
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof useSheetStyles>;
  disabled?: boolean;
}

function NavRow({
  icon,
  label,
  value,
  active,
  onPress,
  colors,
  styles,
  disabled,
}: NavRowProps): React.ReactElement {
  return (
    <PressScale
      onPress={onPress}
      style={styles.navRow}
      accessibilityLabel={label}
      accessibilityHint={`Opens ${label} settings`}
      accessibilityRole="button"
      disabled={disabled}
    >
      <View style={styles.rowLabelWrap}>
        <Ionicons
          name={icon as React.ComponentProps<typeof Ionicons>['name']}
          size={ROW_ICON_SIZE}
          color={active ? colors.brand : colors.textSecondary}
        />
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
      </View>
      <View style={styles.navRight}>
        <Text style={[styles.navValue, { color: colors.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </PressScale>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

function useSheetStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        content: {
          paddingHorizontal: Space.md,
          paddingBottom: Space.lg,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: Space.sm,
          marginBottom: Space.xs,
        },
        title: {
          fontFamily: FontFamily.semibold,
          fontSize: Type.title.size,
        },
        closeBtn: {
          width: Control.hit,
          height: Control.hit,
          borderRadius: Radius.full,
          alignItems: 'center',
          justifyContent: 'center',
        },
        // ── Sections ──
        section: {
          paddingVertical: Space.sm,
        },
        // ── Toggle rows ──
        toggleRow: {
          minHeight: ROW_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: Space.sm,
        },
        navRow: {
          minHeight: ROW_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: Space.sm,
        },
        navRowInner: {
          minHeight: ROW_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: Space.xs,
        },
        rowLabelWrap: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
          flex: 1,
        },
        rowTextWrap: {
          flex: 1,
          gap: 2,
        },
        rowLabel: {
          fontFamily: FontFamily.medium,
          fontSize: Type.body.size,
        },
        rowHint: {
          fontFamily: FontFamily.regular,
          fontSize: Type.caption.size,
        },
        // ── Toggle switch ──
        toggleTrack: {
          width: 44,
          height: 26,
          borderRadius: Radius.full,
          padding: 2,
          justifyContent: 'center',
        },
        toggleThumb: {
          width: 22,
          height: 22,
          borderRadius: Radius.full,
        },
        toggleThumbActive: {
          alignSelf: 'flex-end',
        },
        // ── Nav row right side ──
        navRight: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
        },
        navValue: {
          fontFamily: FontFamily.regular,
          fontSize: Type.caption.size,
        },
        // ── Timer chips ──
        chipRow: {
          flexDirection: 'row',
          gap: Space.sm,
          marginTop: Space.sm,
        },
        chip: {
          paddingHorizontal: Space.sm,
          paddingVertical: Space.xs,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: Control.hit,
        },
        chipText: {
          fontFamily: FontFamily.medium,
          fontSize: Type.caption.size,
        },
        // ── Speed segment ──
        segmentWrap: {
          marginTop: Space.sm,
        },
        // ── Effects expansion ──
        effectsExpand: {
          marginTop: Space.sm,
          paddingLeft: Space.md + Space.sm,
        },
        // ── Divider ──
        divider: {
          height: StyleSheet.hairlineWidth,
          marginVertical: Space.xs,
        },
      }),
    [colors],
  );
}
