/**
 * AudioBrowserSheet — extracted audio selection sheet for the creator studio.
 *
 * A bottom sheet for choosing audio applied to a composition:
 *  - Library tab: a curated sound library. Per AGENTS.md §11 (truthful UI)
 *    the library backend does not yet exist, so the tab presents an honest
 *    empty state — "No sounds available." No song titles, artist names,
 *    or durations are fabricated.
 *  - Original Audio tab: toggle to keep the video's recorded audio and mix
 *    its volume.
 *
 * Track-specific controls (selected-track volume, start offset, preview,
 * duration display) are truthfully disabled until a library track is
 * selected — which is not possible today because the library is empty.
 *
 * The slider is a self-contained PanResponder-based control so this module
 * introduces no new dependencies (the codebase has no slider library).
 *
 * Per AGENTS.md §4: authored composition, clear hierarchy, restraint.
 * Per AGENTS.md §13: 44pt touch targets for interactive controls.
 */
import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  PanResponder,
  LayoutAnimation,
  type LayoutChangeEvent,
  type GestureResponderEvent,
  type PanResponderGestureState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Space,
  Radius,
  Typography,
  FontFamily,
  Control,
  Stroke } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import {
  type AudioConfig,
  type AudioTrack,
  DEFAULT_AUDIO_CONFIG } from './AudioTypes';
import { WaveformTrack } from '../../poster/timeline/WaveformTrack';

// ── Types ──────────────────────────────────────────────────────────

export interface AudioBrowserSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (config: AudioConfig) => void;
  initialConfig?: AudioConfig;
  /** Whether the video has original audio to mix. Default: false. */
  hasOriginalAudio?: boolean;
}

type TabKey = 'library' | 'original';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'library', label: 'Library' },
  { key: 'original', label: 'Original Audio' },
];

// ── Helpers ────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatPercent(v: number): string {
  const clamped = Math.min(1, Math.max(0, v));
  return `${Math.round(clamped * 100)}%`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ── Component ──────────────────────────────────────────────────────

export function AudioBrowserSheet({
  visible,
  onClose,
  onConfirm,
  initialConfig,
  hasOriginalAudio = false }: AudioBrowserSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const styles = useSheetStyles(colors);

  const [activeTab, setActiveTab] = useState<TabKey>(hasOriginalAudio ? 'original' : 'library');
  const [config, setConfig] = useState<AudioConfig>(initialConfig ?? DEFAULT_AUDIO_CONFIG);
  // The library has no backend today; no track can be selected.
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);

  // Reset internal state each time the sheet opens so stale config from a
  // previous session does not leak in.
  useEffect(() => {
    if (visible) {
      setConfig(initialConfig ?? DEFAULT_AUDIO_CONFIG);
      setSelectedTrack(null);
      setActiveTab(hasOriginalAudio ? 'original' : 'library');
    }
  }, [visible, initialConfig, hasOriginalAudio]);

  const keepOriginal = config.originalVolume > 0;

  const handleTabSwitch = useCallback(
    (key: TabKey) => {
      if (key === activeTab) return;
      if (!reducedMotion) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        haptic.selection();
      }
      setActiveTab(key);
    },
    [activeTab, haptic, reducedMotion],
  );

  const handleToggleOriginal = useCallback(() => {
    if (!reducedMotion) haptic.light();
    setConfig((prev) => ({
      ...prev,
      originalVolume: prev.originalVolume > 0 ? 0 : DEFAULT_AUDIO_CONFIG.originalVolume }));
  }, [haptic, reducedMotion]);

  const handleVolumeChange = useCallback((v: number) => {
    setConfig((prev) => ({ ...prev, volume: clamp(v, 0, 1) }));
  }, []);

  const handleOriginalVolumeChange = useCallback((v: number) => {
    setConfig((prev) => ({ ...prev, originalVolume: clamp(v, 0, 1) }));
  }, []);

  const handleStartOffsetChange = useCallback((v: number) => {
    setConfig((prev) => ({
      ...prev,
      startOffsetMs: clamp(v, 0, selectedTrack?.durationMs ?? 0) }));
  }, [selectedTrack]);

  const handleFadeInChange = useCallback((v: number) => {
    setConfig((prev) => ({
      ...prev,
      fadeInMs: clamp(v, 0, selectedTrack?.durationMs ?? 0) }));
  }, [selectedTrack]);

  const handleFadeOutChange = useCallback((v: number) => {
    setConfig((prev) => ({
      ...prev,
      fadeOutMs: clamp(v, 0, selectedTrack?.durationMs ?? 0) }));
  }, [selectedTrack]);

  const handleTrimStartChange = useCallback((v: number) => {
    const maxTrim = selectedTrack?.durationMs ?? 0;
    setConfig((prev) => {
      const clampedStart = clamp(v, 0, maxTrim);
      // Ensure trimStart < trimEnd (if trimEnd is set).
      const currentEnd = prev.trimEndMs ?? maxTrim;
      return {
        ...prev,
        trimStartMs: clampedStart,
        trimEndMs: Math.max(clampedStart + 100, currentEnd) };
    });
  }, [selectedTrack]);

  const handleTrimEndChange = useCallback((v: number) => {
    const maxTrim = selectedTrack?.durationMs ?? 0;
    setConfig((prev) => {
      const clampedEnd = clamp(v, 100, maxTrim);
      const currentStart = prev.trimStartMs ?? 0;
      return {
        ...prev,
        trimStartMs: Math.min(currentStart, clampedEnd - 100),
        trimEndMs: clampedEnd };
    });
  }, [selectedTrack]);

  const handleConfirm = useCallback(() => {
    if (!reducedMotion) haptic.medium();
    onConfirm(config);
  }, [config, haptic, onConfirm, reducedMotion]);

  const handleClose = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onClose();
  }, [haptic, onClose, reducedMotion]);

  // A track is only selectable from the library, which is empty today.
  const hasSelectedTrack = selectedTrack !== null;
  const previewDisabled = !hasSelectedTrack;
  const trackVolumeDisabled = !hasSelectedTrack;
  const startOffsetDisabled = !hasSelectedTrack || (selectedTrack?.durationMs ?? 0) <= 0;

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Audio</Text>
          <PressScale
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityLabel="Close audio browser"
            accessibilityHint="Closes the audio selection sheet"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
          </PressScale>
        </View>

        {/* ── Tabs ────────────────────────────────────────────────── */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            // The Original Audio tab is only meaningful when the video has
            // original audio; otherwise it is truthfully disabled.
            const tabDisabled = tab.key === 'original' && !hasOriginalAudio;
            const tabColor = isActive
              ? colors.brand
              : tabDisabled
                ? colors.textMuted
                : colors.textSecondary;
            return (
              <Pressable
                key={tab.key}
                onPress={() => handleTabSwitch(tab.key)}
                disabled={tabDisabled}
                accessibilityLabel={tab.label}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive, disabled: tabDisabled }}
                style={styles.tab}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: tabColor },
                    isActive && styles.tabLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
                <View
                  style={[
                    styles.tabUnderline,
                    { backgroundColor: isActive ? colors.brand : 'transparent' },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        {/* ── Tab body ────────────────────────────────────────────── */}
        {activeTab === 'library' ? (
          <LibraryTabBody colors={colors} />
        ) : (
          <OriginalAudioTabBody
            colors={colors}
            keepOriginal={keepOriginal}
            hasOriginalAudio={hasOriginalAudio}
            originalVolume={config.originalVolume}
            onToggleOriginal={handleToggleOriginal}
            onVolumeChange={handleOriginalVolumeChange}
          />
        )}

        {/* ── Selected-track controls ─────────────────────────────── */}
        <View style={styles.sectionDivider} />

        <View style={styles.trackControls}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Selected Track
          </Text>

          {hasSelectedTrack && selectedTrack ? (
            <>
              <View style={styles.trackMetaRow}>
                <View style={styles.trackMetaInfo}>
                  <Text style={[styles.trackTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {selectedTrack.title}
                  </Text>
                  {selectedTrack.artist ? (
                    <Text style={[styles.trackArtist, { color: colors.textMuted }]} numberOfLines={1}>
                      {selectedTrack.artist}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.durationText, { color: colors.textSecondary }]}>
                  {formatDuration(selectedTrack.durationMs)}
                </Text>
              </View>

              <SliderRow
                label="Track Volume"
                valueText={formatPercent(config.volume)}
                min={0}
                max={1}
                value={config.volume}
                trackColor={colors.border}
                fillColor={colors.brand}
                thumbColor={colors.textPrimary}
                labelColor={colors.textPrimary}
                valueColor={colors.textMuted}
                onChange={handleVolumeChange}
                disabled={trackVolumeDisabled}
              />

              <SliderRow
                label="Start Offset"
                valueText={formatDuration(config.startOffsetMs)}
                min={0}
                max={selectedTrack.durationMs}
                value={config.startOffsetMs}
                trackColor={colors.border}
                fillColor={colors.brand}
                thumbColor={colors.textPrimary}
                labelColor={colors.textPrimary}
                valueColor={colors.textMuted}
                onChange={handleStartOffsetChange}
                disabled={startOffsetDisabled}
              />

              {/* ── Waveform visualization ── */}
              <View style={styles.waveformSection}>
                <Text style={[styles.waveformLabel, { color: colors.textSecondary }]}>
                  Waveform
                </Text>
                <WaveformTrack
                  samples={selectedTrack.waveform}
                  audioUri={selectedTrack.uri}
                  trackWidth={280}
                  color={colors.antiqueGold}
                  height={36}
                />
              </View>

              {/* ── Fade controls (timeline integration) ── */}
              <SliderRow
                label="Fade In"
                valueText={formatDuration(config.fadeInMs)}
                min={0}
                max={selectedTrack.durationMs}
                value={config.fadeInMs}
                trackColor={colors.border}
                fillColor={colors.brand}
                thumbColor={colors.textPrimary}
                labelColor={colors.textPrimary}
                valueColor={colors.textMuted}
                onChange={handleFadeInChange}
                disabled={trackVolumeDisabled}
              />

              <SliderRow
                label="Fade Out"
                valueText={formatDuration(config.fadeOutMs)}
                min={0}
                max={selectedTrack.durationMs}
                value={config.fadeOutMs}
                trackColor={colors.border}
                fillColor={colors.brand}
                thumbColor={colors.textPrimary}
                labelColor={colors.textPrimary}
                valueColor={colors.textMuted}
                onChange={handleFadeOutChange}
                disabled={trackVolumeDisabled}
              />

              {/* ── Trim controls (timeline integration) ── */}
              <SliderRow
                label="Trim Start"
                valueText={formatDuration(config.trimStartMs ?? 0)}
                min={0}
                max={selectedTrack.durationMs}
                value={config.trimStartMs ?? 0}
                trackColor={colors.border}
                fillColor={colors.antiqueGold}
                thumbColor={colors.textPrimary}
                labelColor={colors.textPrimary}
                valueColor={colors.textMuted}
                onChange={handleTrimStartChange}
                disabled={trackVolumeDisabled}
              />

              <SliderRow
                label="Trim End"
                valueText={formatDuration(config.trimEndMs ?? selectedTrack.durationMs)}
                min={0}
                max={selectedTrack.durationMs}
                value={config.trimEndMs ?? selectedTrack.durationMs}
                trackColor={colors.border}
                fillColor={colors.antiqueGold}
                thumbColor={colors.textPrimary}
                labelColor={colors.textPrimary}
                valueColor={colors.textMuted}
                onChange={handleTrimEndChange}
                disabled={trackVolumeDisabled}
              />

              <PreviewButton
                colors={colors}
                disabled={previewDisabled}
                haptic={haptic}
                reducedMotion={reducedMotion}
              />
            </>
          ) : (
            <View style={styles.noTrackState}>
              <Text style={[styles.noTrackText, { color: colors.textMuted }]}>
                No track selected
              </Text>
            </View>
          )}
        </View>

        {/* ── Done ────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleConfirm}
            style={[styles.doneBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Done"
            accessibilityRole="button"
            accessibilityHint="Applies the audio configuration and closes the sheet"
          >
            <Text style={[styles.doneBtnText, { color: colors.textInverse }]}>Done</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SheetContainer>
  );
}

// ── Library tab body (truthful empty state) ─────────────────────────

function LibraryTabBody({ colors }: { colors: ThemeColors }) {
  const styles = useSheetStyles(colors);
  return (
    <View style={styles.emptyBody}>
      <Text style={[styles.emptyTitle, { color: colors.textMuted }]}>
        No sounds available
      </Text>
    </View>
  );
}

// ── Original Audio tab body ─────────────────────────────────────────

interface OriginalAudioTabBodyProps {
  colors: ThemeColors;
  keepOriginal: boolean;
  hasOriginalAudio: boolean;
  originalVolume: number;
  onToggleOriginal: () => void;
  onVolumeChange: (v: number) => void;
}

function OriginalAudioTabBody({
  colors,
  keepOriginal,
  hasOriginalAudio,
  originalVolume,
  onToggleOriginal,
  onVolumeChange }: OriginalAudioTabBodyProps) {
  const styles = useSheetStyles(colors);
  if (!hasOriginalAudio) {
    return (
      <View style={styles.emptyBody}>
        <Text style={[styles.emptyTitle, { color: colors.textMuted }]}>
          No original audio
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.originalBody}>
      <Pressable
        onPress={onToggleOriginal}
        style={styles.toggleRow}
        accessibilityLabel="Keep original audio"
        accessibilityRole="switch"
        accessibilityState={{ checked: keepOriginal }}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
      >
        <View style={styles.toggleTextWrap}>
          <Text style={[styles.toggleTitle, { color: colors.textPrimary }]}>
            Keep Original Audio
          </Text>
        </View>
        <View
          style={[
            styles.switchTrack,
            {
              backgroundColor: keepOriginal ? colors.brand : colors.surfaceAlt,
              borderColor: keepOriginal ? colors.brand : colors.border },
          ]}
        >
          <View
            style={[
              styles.switchThumb,
              {
                backgroundColor: keepOriginal ? colors.textInverse : colors.textSecondary,
                transform: [{ translateX: keepOriginal ? 22 : 2 }] },
            ]}
          />
        </View>
      </Pressable>

      {keepOriginal ? (
        <SliderRow
          label="Original Volume"
          valueText={formatPercent(originalVolume)}
          min={0}
          max={1}
          value={originalVolume}
          trackColor={colors.border}
          fillColor={colors.brand}
          thumbColor={colors.textPrimary}
          labelColor={colors.textPrimary}
          valueColor={colors.textMuted}
          onChange={onVolumeChange}
          disabled={false}
        />
      ) : null}
    </View>
  );
}

// ── Preview button ──────────────────────────────────────────────────

interface PreviewButtonProps {
  colors: ThemeColors;
  disabled: boolean;
  haptic: ReturnType<typeof useHaptic>;
  reducedMotion: boolean;
}

function PreviewButton({ colors, disabled, haptic, reducedMotion }: PreviewButtonProps) {
  const [playing, setPlaying] = useState(false);
  const styles = useSheetStyles(colors);

  const handlePress = useCallback(() => {
    if (disabled) return;
    if (!reducedMotion) haptic.light();
    // Truthful preview: there is no playback engine wired here today, so we
    // toggle a local playing state only to reflect intent. When a real
    // preview backend exists it will be connected here without changing the
    // disabled contract.
    setPlaying((p) => !p);
  }, [disabled, haptic, reducedMotion]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={[
        styles.previewBtn,
        { borderColor: disabled ? colors.border : colors.brand },
      ]}
      accessibilityLabel={playing ? 'Stop preview' : 'Play preview'}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Ionicons
        name={playing ? 'pause' : 'play'}
        size={IconGrammar.metadata}
        color={disabled ? colors.textMuted : colors.brand}
      />
      <Text
        style={[
          styles.previewBtnText,
          { color: disabled ? colors.textMuted : colors.brand },
        ]}
      >
        {playing ? 'Stop' : 'Preview'}
      </Text>
    </Pressable>
  );
}

// ── Slider row (PanResponder-based, no new deps) ───────────────────

interface SliderRowProps {
  label: string;
  valueText: string;
  min: number;
  max: number;
  value: number;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
  labelColor: string;
  valueColor: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function SliderRow({
  label,
  valueText,
  min,
  max,
  value,
  trackColor,
  fillColor,
  thumbColor,
  labelColor,
  valueColor,
  onChange,
  disabled = false }: SliderRowProps) {
  const { colors } = useAppTheme();
  const styles = useSheetStyles(colors);
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const range = max - min;
  const clamped = clamp(value, min, max);
  const ratio = range === 0 ? 0 : (clamped - min) / range;
  const trackLayoutWidth = trackWidth > 0 ? trackWidth : 1;
  const thumbPosition = ratio * trackLayoutWidth;

  const valueToPosition = useCallback(
    (x: number) => {
      const r = Math.min(1, Math.max(0, x / trackLayoutWidth));
      return min + r * range;
    },
    [trackLayoutWidth, min, range],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
          const next = valueToPosition(thumbPosition + g.dx);
          onChange(Math.round(next * 1000) / 1000);
        },
        onPanResponderRelease: () => {},
        onPanResponderTerminationRequest: () => false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thumbPosition, valueToPosition, onChange, disabled],
  );

  const opacity = disabled ? 0.4 : 1;

  return (
    <View style={[styles.sliderRow, { opacity }]}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.sliderLabel, { color: labelColor, fontFamily: FontFamily.regular }]}>
          {label}
        </Text>
        <Text style={[styles.sliderValue, { color: valueColor, fontFamily: FontFamily.medium }]}>
          {valueText}
        </Text>
      </View>
      <View
        style={styles.trackWrap}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        <View style={[styles.track, { backgroundColor: trackColor }]} />
        <View
          style={[
            styles.fill,
            {
              width: thumbPosition,
              backgroundColor: fillColor },
          ]}
        />
        <View
          style={[
            styles.thumb,
            {
              left: thumbPosition,
              backgroundColor: thumbColor },
          ]}
        />
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm },
    // ── Tabs ──
    tabBar: {
      flexDirection: 'row',
      gap: Space.lg,
      paddingVertical: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      marginBottom: Space.md },
    tab: {
      alignItems: 'center',
      paddingVertical: Space.xs },
    tabLabel: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.bodyStrong.size },
    tabLabelActive: {
      fontFamily: Typography.family.semibold },
    tabUnderline: {
      height: Stroke.emphasis,
      borderRadius: Stroke.emphasis / 2,
      width: 24,
      marginTop: Space.xxs },
    // ── Empty / original bodies ──
    emptyBody: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      gap: Space.sm },
    emptyTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    originalBody: {
      paddingVertical: Space.sm,
      gap: Space.md },
    // ── Toggle ──
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      minHeight: Control.hit },
    toggleTextWrap: {
      flex: 1,
      paddingRight: Space.md,
      gap: 2 },
    toggleTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size },
    switchTrack: {
      width: 46,
      height: 28,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      justifyContent: 'center' },
    switchThumb: {
      position: 'absolute',
      width: 22,
      height: 22,
      borderRadius: Radius.full },
    // ── Track controls ──
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.md },
    trackControls: {
      gap: Space.sm },
    sectionTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size },
    trackMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.xs },
    trackMetaInfo: {
      flex: 1,
      gap: 2,
      paddingRight: Space.md },
    trackTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size },
    trackArtist: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size },
    durationText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      fontVariant: ['tabular-nums'] },
    // ── Waveform ──
    waveformSection: {
      gap: Space.xxs,
      paddingVertical: Space.xs },
    waveformLabel: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size },
    noTrackState: {
      paddingVertical: Space.lg,
      alignItems: 'center',
      gap: Space.xs },
    noTrackText: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    // ── Slider ──
    sliderRow: {
      paddingVertical: Space.sm },
    sliderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.xs },
    sliderLabel: {
      fontSize: TypographyV2.meta.size },
    sliderValue: {
      fontSize: TypographyV2.meta.size,
      fontVariant: ['tabular-nums'] },
    trackWrap: {
      height: Control.hit,
      justifyContent: 'center',
      position: 'relative' },
    track: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 3,
      borderRadius: Radius.full },
    fill: {
      position: 'absolute',
      left: 0,
      height: 3,
      borderRadius: Radius.full },
    thumb: {
      position: 'absolute',
      width: 16,
      height: 16,
      borderRadius: Radius.full,
      marginLeft: -8,
      borderWidth: Stroke.standard,
      borderColor: 'rgba(0,0,0,0)' },
    // ── Preview ──
    previewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      marginTop: Space.xs,
      minHeight: Control.hit },
    previewBtnText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size },
    // ── Footer ──
    footer: {
      paddingTop: Space.lg },
    doneBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      height: 50,
      borderRadius: Radius.lg },
    doneBtnText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size } });
}

// Memoised style factory keyed to colors so re-renders only rebuild when
// the theme changes.
const styleCache = new WeakMap<ThemeColors, ReturnType<typeof createStyles>>();
function useSheetStyles(colors: ThemeColors): ReturnType<typeof createStyles> {
  let cached = styleCache.get(colors);
  if (!cached) {
    cached = createStyles(colors);
    styleCache.set(colors, cached);
  }
  return cached;
}
