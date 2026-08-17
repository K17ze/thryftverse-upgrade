/**
 * AudioMixPanel — audio mixing panel for the ThryftVerse creator editor.
 *
 * Per spec 09_POSTER_TIMELINE_CAMERA_AUDIO §10:
 *   P0: source clip volume, music track, mute, offset/trim, fades
 *   P1: ducking (auto-lower background music when voiceover is active)
 *
 * Features:
 *   - Lists all audio layers (music + voiceover) from the composition
 *   - Per-track: name, type icon, volume slider, fade in/out, mute/solo, delete
 *   - Ducking toggle: when enabled, music auto-lowers when voiceover is active
 *   - Master volume slider
 *   - Updates the composition via CreatorContext (updateLayer / removeLayer)
 *
 * Per AGENTS.md §11 (truthful UI): when there are no audio layers, the panel
 * presents an honest empty state rather than fabricated tracks.
 * Per AGENTS.md §13: 44pt touch targets for all interactive controls.
 * Per AGENTS.md §17: Reanimated for animations (uses CreatorSlider).
 */
import React, { useCallback, useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  Space,
  Radius,
  Type,
  Typography,
  FontFamily,
  Control,
  Stroke,
} from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useCreator } from '../../CreatorContext';
import { CreatorSlider } from '../../controls/CreatorSlider';
import { CreatorToolButton } from '../../controls/CreatorToolButton';
import type { CreatorLayer } from '../../composition';
import type { DuckingConfig } from '../../core/audio';

// ── Types ─────────────────────────────────────────────────────────────

export interface AudioMixPanelProps {
  visible: boolean;
  onClose: () => void;
  /** Master volume (0..1). Stored by the parent; updated via callback. */
  masterVolume?: number;
  onMasterVolumeChange?: (v: number) => void;
  /** Ducking config. Stored by the parent; updated via callback. */
  ducking?: DuckingConfig;
  onDuckingChange?: (config: DuckingConfig) => void;
}

type AudioLayerType = 'music' | 'voiceover';

interface AudioTrackInfo {
  layer: Extract<CreatorLayer, { type: 'music' }>;
  type: AudioLayerType;
  name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0.0s';
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatPercent(v: number): string {
  const clamped = Math.min(1, Math.max(0, v));
  return `${Math.round(clamped * 100)}%`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Extract all music layers from the document across all pages.
 * Voiceover layers are music layers whose trackName indicates a voiceover
 * recording (prefixed with "Voiceover"). This convention is established by
 * the VoiceoverRecorderSheet when it adds a voiceover to the composition.
 */
function extractAudioTracks(layers: CreatorLayer[]): AudioTrackInfo[] {
  const tracks: AudioTrackInfo[] = [];
  for (const layer of layers) {
    if (layer.type !== 'music' || layer.hidden) continue;
    const payload = layer.payload;
    const isVoiceover = payload.trackName.toLowerCase().startsWith('voiceover');
    tracks.push({
      layer,
      type: isVoiceover ? 'voiceover' : 'music',
      name: payload.trackName,
    });
  }
  return tracks;
}

// ── Component ─────────────────────────────────────────────────────────

export function AudioMixPanel({
  visible,
  onClose,
  masterVolume = 1,
  onMasterVolumeChange,
  ducking,
  onDuckingChange,
}: AudioMixPanelProps): React.ReactElement {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const styles = useSheetStyles(colors);

  const creator = useCreator();
  const { document, activePageIndex, updateLayer, removeLayer } = creator;

  // ── Local state ───────────────────────────────────────────────────
  const [soloTrackId, setSoloTrackId] = useState<string | null>(null);
  const [mutedTracks, setMutedTracks] = useState<Set<string>>(new Set());
  const [prevVolumes, setPrevVolumes] = useState<Map<string, number>>(new Map());
  const [localDuckingEnabled, setLocalDuckingEnabled] = useState(
    ducking?.enabled ?? false,
  );

  // Reset state when sheet opens
  useEffect(() => {
    if (visible) {
      setSoloTrackId(null);
      setMutedTracks(new Set());
      setPrevVolumes(new Map());
      setLocalDuckingEnabled(ducking?.enabled ?? false);
    }
  }, [visible, ducking?.enabled]);

  // ── Audio tracks from the composition ─────────────────────────────
  const allLayers = useMemo(() => {
    const layers: CreatorLayer[] = [];
    for (const page of document.pages) {
      layers.push(...page.layers);
    }
    return layers;
  }, [document.pages]);

  const tracks = useMemo(
    () => extractAudioTracks(allLayers),
    [allLayers],
  );

  // ── Track updates ─────────────────────────────────────────────────
  const handleVolumeChange = useCallback(
    (layerId: string, volume: number) => {
      updateLayer(layerId, {
        payload: {
          ...tracks.find((t) => t.layer.id === layerId)!.layer.payload,
          volume: clamp(volume, 0, 1),
        },
      } as Partial<CreatorLayer>, 'Adjust volume');
    },
    [tracks, updateLayer],
  );

  const handleFadeInChange = useCallback(
    (layerId: string, fadeInMs: number) => {
      const track = tracks.find((t) => t.layer.id === layerId);
      if (!track) return;
      updateLayer(layerId, {
        payload: {
          ...track.layer.payload,
          fadeInMs: clamp(fadeInMs, 0, 3000),
        },
      } as Partial<CreatorLayer>, 'Adjust fade in');
    },
    [tracks, updateLayer],
  );

  const handleFadeOutChange = useCallback(
    (layerId: string, fadeOutMs: number) => {
      const track = tracks.find((t) => t.layer.id === layerId);
      if (!track) return;
      updateLayer(layerId, {
        payload: {
          ...track.layer.payload,
          fadeOutMs: clamp(fadeOutMs, 0, 3000),
        },
      } as Partial<CreatorLayer>, 'Adjust fade out');
    },
    [tracks, updateLayer],
  );

  const handleMuteToggle = useCallback(
    (layerId: string) => {
      if (!reducedMotion) haptic.light();
      setMutedTracks((prev) => {
        const next = new Set(prev);
        const track = tracks.find((t) => t.layer.id === layerId);
        if (!track) return prev;
        if (next.has(layerId)) {
          // Unmute — restore previous volume
          next.delete(layerId);
          const prevVol = prevVolumes.get(layerId);
          if (prevVol !== undefined) {
            updateLayer(layerId, {
              payload: {
                ...track.layer.payload,
                volume: prevVol,
              },
            } as Partial<CreatorLayer>, 'Unmute track');
          }
        } else {
          // Mute — save current volume, set to 0
          next.add(layerId);
          setPrevVolumes((pv) => {
            const npv = new Map(pv);
            npv.set(layerId, track.layer.payload.volume);
            return npv;
          });
          updateLayer(layerId, {
            payload: {
              ...track.layer.payload,
              volume: 0,
            },
          } as Partial<CreatorLayer>, 'Mute track');
        }
        return next;
      });
    },
    [tracks, updateLayer, haptic, reducedMotion, prevVolumes],
  );

  const handleSoloToggle = useCallback(
    (layerId: string) => {
      if (!reducedMotion) haptic.light();
      setSoloTrackId((prev) => (prev === layerId ? null : layerId));
    },
    [haptic, reducedMotion],
  );

  const handleDelete = useCallback(
    (layerId: string) => {
      if (!reducedMotion) haptic.heavy();
      removeLayer(layerId);
      // Clean up local state
      setMutedTracks((prev) => {
        const next = new Set(prev);
        next.delete(layerId);
        return next;
      });
      setSoloTrackId((prev) => (prev === layerId ? null : prev));
    },
    [removeLayer, haptic, reducedMotion],
  );

  const handleDuckingToggle = useCallback(() => {
    if (!reducedMotion) haptic.selection();
    const newEnabled = !localDuckingEnabled;
    setLocalDuckingEnabled(newEnabled);
    if (onDuckingChange && ducking) {
      onDuckingChange({ ...ducking, enabled: newEnabled });
    } else if (onDuckingChange) {
      onDuckingChange({
        enabled: newEnabled,
        level: 0.3,
        priorityTrackId: null,
        fadeMs: 300,
      });
    }
  }, [localDuckingEnabled, onDuckingChange, ducking, haptic, reducedMotion]);

  const handleMasterVolumeChange = useCallback(
    (v: number) => {
      onMasterVolumeChange?.(clamp(v, 0, 1));
    },
    [onMasterVolumeChange],
  );

  const handleClose = useCallback(() => {
    if (!reducedMotion) haptic.light();
    onClose();
  }, [haptic, onClose, reducedMotion]);

  // ── Render ────────────────────────────────────────────────────────
  const hasTracks = tracks.length > 0;
  const hasVoiceover = tracks.some((t) => t.type === 'voiceover');

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Audio Mix
          </Text>
          <PressScale
            onPress={handleClose}
            style={styles.closeBtn}
            accessibilityLabel="Close audio mix panel"
            accessibilityHint="Closes the audio mixing panel"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>

        {hasTracks ? (
          <>
            {/* ── Track list ─────────────────────────────────────────── */}
            <View style={styles.trackList}>
              {tracks.map((track) => (
                <TrackRow
                  key={track.layer.id}
                  track={track}
                  colors={colors}
                  styles={styles}
                  isMuted={mutedTracks.has(track.layer.id)}
                  isSoloed={soloTrackId === track.layer.id}
                  hasOtherSolo={soloTrackId !== null && soloTrackId !== track.layer.id}
                  onVolumeChange={(v) => handleVolumeChange(track.layer.id, v)}
                  onFadeInChange={(v) => handleFadeInChange(track.layer.id, v)}
                  onFadeOutChange={(v) => handleFadeOutChange(track.layer.id, v)}
                  onMuteToggle={() => handleMuteToggle(track.layer.id)}
                  onSoloToggle={() => handleSoloToggle(track.layer.id)}
                  onDelete={() => handleDelete(track.layer.id)}
                />
              ))}
            </View>

            {/* ── Ducking ────────────────────────────────────────────── */}
            <View style={styles.sectionDivider} />
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Ducking
              </Text>
              <Pressable
                onPress={handleDuckingToggle}
                style={styles.toggleRow}
                accessibilityLabel="Ducking — auto-lower music during voiceover"
                accessibilityRole="switch"
                accessibilityState={{ checked: localDuckingEnabled }}
                disabled={!hasVoiceover}
              >
                <View style={styles.toggleTextWrap}>
                  <Text
                    style={[styles.toggleTitle, { color: colors.textPrimary }]}
                  >
                    Auto-lower music during voiceover
                  </Text>
                  <Text
                    style={[styles.toggleHint, { color: colors.textMuted }]}
                  >
                    {hasVoiceover
                      ? 'Background music dips when voiceover is active.'
                      : 'Add a voiceover to enable ducking.'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.switchTrack,
                    {
                      backgroundColor: localDuckingEnabled
                        ? colors.brand
                        : colors.surfaceAlt,
                      borderColor: localDuckingEnabled
                        ? colors.brand
                        : colors.border,
                      opacity: hasVoiceover ? 1 : 0.4,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.switchThumb,
                      {
                        backgroundColor: localDuckingEnabled
                          ? colors.textInverse
                          : colors.textSecondary,
                        transform: [
                          { translateX: localDuckingEnabled ? 22 : 2 },
                        ],
                      },
                    ]}
                  />
                </View>
              </Pressable>
            </View>

            {/* ── Master volume ──────────────────────────────────────── */}
            <View style={styles.sectionDivider} />
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Master
              </Text>
              <CreatorSlider
                value={masterVolume}
                min={0}
                max={1}
                step={0.01}
                label="Master Volume"
                accessibilityLabel={`Master volume, ${formatPercent(masterVolume)}`}
                onValueChange={handleMasterVolumeChange}
                onCommit={handleMasterVolumeChange}
              />
            </View>
          </>
        ) : (
          /* ── Empty state (truthful) ── */
          <View style={styles.emptyBody}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No audio tracks
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Add music or record a voiceover to start mixing audio for
              your composition.
            </Text>
          </View>
        )}
      </ScrollView>
    </SheetContainer>
  );
}

// ── Track row ─────────────────────────────────────────────────────────

interface TrackRowProps {
  track: AudioTrackInfo;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  isMuted: boolean;
  isSoloed: boolean;
  hasOtherSolo: boolean;
  onVolumeChange: (v: number) => void;
  onFadeInChange: (v: number) => void;
  onFadeOutChange: (v: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onDelete: () => void;
}

function TrackRow({
  track,
  colors,
  styles,
  isMuted,
  isSoloed,
  hasOtherSolo,
  onVolumeChange,
  onFadeInChange,
  onFadeOutChange,
  onMuteToggle,
  onSoloToggle,
  onDelete,
}: TrackRowProps): React.ReactElement {
  const payload = track.layer.payload;
  const iconName: React.ComponentProps<typeof Ionicons>['name'] =
    track.type === 'voiceover' ? 'mic' : 'musical-notes';

  const effectiveOpacity = hasOtherSolo ? 0.4 : 1;

  return (
    <View style={[styles.trackRow, { opacity: effectiveOpacity }]}>
      {/* ── Track header: icon + name + controls ── */}
      <View style={styles.trackHeader}>
        <View style={styles.trackInfo}>
          <Ionicons
            name={iconName}
            size={16}
            color={track.type === 'voiceover' ? colors.brand : colors.textSecondary}
          />
          <View style={styles.trackMeta}>
            <Text
              style={[styles.trackName, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {track.name}
            </Text>
            <Text style={[styles.trackType, { color: colors.textMuted }]}>
              {track.type === 'voiceover' ? 'Voiceover' : 'Music'}
            </Text>
          </View>
        </View>

        {/* ── Mute / Solo / Delete buttons ── */}
        <View style={styles.trackActions}>
          <CreatorToolButton
            icon={isMuted ? 'volume-mute' : 'volume-medium'}
            active={isMuted}
            selectedStyle="fill"
            onPress={onMuteToggle}
            accessibilityLabel={isMuted ? 'Unmute track' : 'Mute track'}
            accessibilityHint={`Mutes or unmutes ${track.name}`}
          />
          <CreatorToolButton
            icon={isSoloed ? 'headset' : 'headset-outline'}
            active={isSoloed}
            selectedStyle="fill"
            onPress={onSoloToggle}
            accessibilityLabel={isSoloed ? 'Unsolo track' : 'Solo track'}
            accessibilityHint={`Solos ${track.name}, muting all other tracks`}
          />
          <CreatorToolButton
            icon="trash-outline"
            onPress={onDelete}
            accessibilityLabel="Delete track"
            accessibilityHint={`Removes ${track.name} from the composition`}
          />
        </View>
      </View>

      {/* ── Volume slider ── */}
      <CreatorSlider
        value={payload.volume}
        min={0}
        max={1}
        step={0.01}
        label="Volume"
        accessibilityLabel={`Volume for ${track.name}, ${formatPercent(payload.volume)}`}
        onValueChange={onVolumeChange}
        onCommit={onVolumeChange}
        disabled={isMuted}
      />

      {/* ── Fade in / Fade out ── */}
      <View style={styles.fadeRow}>
        <View style={styles.fadeColumn}>
          <CreatorSlider
            value={payload.fadeInMs ?? 0}
            min={0}
            max={3000}
            step={100}
            label="Fade In"
            accessibilityLabel={`Fade in for ${track.name}, ${formatDuration(payload.fadeInMs ?? 0)}`}
            onValueChange={onFadeInChange}
            onCommit={onFadeInChange}
          />
        </View>
        <View style={styles.fadeColumn}>
          <CreatorSlider
            value={payload.fadeOutMs ?? 0}
            min={0}
            max={3000}
            step={100}
            label="Fade Out"
            accessibilityLabel={`Fade out for ${track.name}, ${formatDuration(payload.fadeOutMs ?? 0)}`}
            onValueChange={onFadeOutChange}
            onCommit={onFadeOutChange}
          />
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
    },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.subtitle.size,
    },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm,
    },
    // ── Track list ──
    trackList: {
      gap: Space.md,
      paddingVertical: Space.sm,
    },
    trackRow: {
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    trackHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    trackInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      flex: 1,
      paddingRight: Space.sm,
    },
    trackMeta: {
      flex: 1,
      gap: 1,
    },
    trackName: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    trackType: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
    },
    trackActions: {
      flexDirection: 'row',
      gap: Space.xxs,
      alignItems: 'center',
    },
    // ── Fade row ──
    fadeRow: {
      flexDirection: 'row',
      gap: Space.md,
    },
    fadeColumn: {
      flex: 1,
    },
    // ── Sections ──
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: Space.md,
    },
    section: {
      gap: Space.sm,
    },
    sectionTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyEmphasis.size,
    },
    // ── Toggle ──
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      minHeight: Control.hit,
    },
    toggleTextWrap: {
      flex: 1,
      paddingRight: Space.md,
      gap: 2,
    },
    toggleTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    toggleHint: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
    },
    switchTrack: {
      width: 46,
      height: 28,
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      justifyContent: 'center',
    },
    switchThumb: {
      position: 'absolute',
      width: 22,
      height: 22,
      borderRadius: Radius.full,
    },
    // ── Empty state ──
    emptyBody: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      gap: Space.sm,
    },
    emptyTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyEmphasis.size,
    },
    emptySubtitle: {
      fontFamily: Typography.family.regular,
      fontSize: Type.body.size,
      textAlign: 'center',
      paddingHorizontal: Space.lg,
    },
  });
}

// ── Memoised style factory ────────────────────────────────────────────

const styleCache = new WeakMap<ThemeColors, ReturnType<typeof createStyles>>();
function useSheetStyles(colors: ThemeColors): ReturnType<typeof createStyles> {
  let cached = styleCache.get(colors);
  if (!cached) {
    cached = createStyles(colors);
    styleCache.set(colors, cached);
  }
  return cached;
}
