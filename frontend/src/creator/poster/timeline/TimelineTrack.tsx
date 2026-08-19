import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSharedValue } from 'react-native-reanimated';
import { Space } from '../../../theme/designTokens';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { ClipThumb } from './ClipThumb';
import { Playhead } from './Playhead';
import type { PosterClip } from './TimelineTypes';

// ───────────────────────────────────────────────────────────────────────────
// TimelineTrack — the primary clip track.
//
// Renders ClipThumb for each clip side by side (width proportional to each
// clip's speed-adjusted duration) inside a single 60pt-tall rounded track.
// The Playhead is overlaid on top and scrubs the full track width.
//
// The track uses a fixed pixel-per-ms scale derived from the measured track
// width and the total timeline duration, so clip widths stay proportional
// to their real wall-clock length.
// ───────────────────────────────────────────────────────────────────────────

const TRACK_HEIGHT = 60;
const CLIP_GAP = Space.xxs;
const TRANSITION_ICON_SIZE = 22;

export interface TimelineTrackProps {
  clips: PosterClip[];
  selectedClipId: string | null;
  playheadMs: number;
  totalDurationMs: number;
  onSelectClip: (id: string) => void;
  onSeek: (ms: number) => void;
  onTrimClip: (clipId: string, edge: 'start' | 'end', deltaMs: number) => void;
  /**
   * Transition preset IDs for each clip boundary (length = clips.length - 1).
   * Index i is the transition between clip[i] and clip[i+1]. null/undefined
   * means no transition is set. When provided, a tappable transition icon is
   * rendered at each boundary — tapping opens the transition drawer for the
   * source page of clip[i].
   */
  transitionIds?: (string | null)[];
  onSelectTransition?: (boundaryIndex: number) => void;
}

export const TimelineTrack = React.memo(function TimelineTrack({
  clips,
  selectedClipId,
  playheadMs,
  totalDurationMs,
  onSelectClip,
  onSeek,
  onTrimClip,
  transitionIds,
  onSelectTransition,
}: TimelineTrackProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const widthSV = useSharedValue(0);
  const [trackWidth, setTrackWidth] = React.useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthSV.value = w;
    setTrackWidth(w);
  }, [widthSV]);

  const pxPerMs = trackWidth > 0 && totalDurationMs > 0 ? trackWidth / totalDurationMs : 0;

  // ── Transition boundary positions ──────────────────────────────────
  // Compute the x-center of each clip boundary so transition icons can be
  // overlaid on the track without disturbing the proportional clip layout.
  // The clipsRow has paddingHorizontal: Space.xxs and each ClipThumb has
  // marginRight: CLIP_GAP, so the boundary center after clip[i] is at:
  //   padX + sum(width[0..i]) + CLIP_GAP / 2
  const boundaryCenters = React.useMemo(() => {
    if (clips.length < 2 || pxPerMs <= 0) return [];
    const padX = Space.xxs;
    const centers: number[] = [];
    let cumWidth = 0;
    for (let i = 0; i < clips.length - 1; i++) {
      const w = Math.max(24, clips[i].durationMs * pxPerMs - CLIP_GAP);
      cumWidth += w;
      centers.push(padX + cumWidth + CLIP_GAP / 2);
    }
    return centers;
  }, [clips, pxPerMs]);

  const handleTransitionPress = useCallback(
    (boundaryIndex: number) => {
      haptic.light();
      onSelectTransition?.(boundaryIndex);
    },
    [haptic, onSelectTransition],
  );

  return (
    <View
      onLayout={handleLayout}
      style={[
        trackStyles.container,
        {
          height: TRACK_HEIGHT,
          backgroundColor: colors.surfaceAlt,
        },
      ]}
      accessibilityLabel="Timeline clip track"
    >
      <View style={trackStyles.clipsRow}>
        {clips.map((clip) => {
          const width = Math.max(24, clip.durationMs * pxPerMs - CLIP_GAP);
          return (
            <ClipThumb
              key={clip.id}
              clip={clip}
              width={width}
              isSelected={clip.id === selectedClipId}
              onPress={() => onSelectClip(clip.id)}
              onTrimStart={(deltaMs) => onTrimClip(clip.id, 'start', deltaMs)}
              onTrimEnd={(deltaMs) => onTrimClip(clip.id, 'end', deltaMs)}
            />
          );
        })}
      </View>

      {/* ── Transition icons between clips ──────────────────────────────
          Rendered as an overlay on top of the track at each clip boundary.
          A set transition shows the swap icon in the brand accent; an unset
          boundary shows a subtle plus icon. Tapping opens the transition
          drawer for the source page (progressive disclosure: the icon is
          only visible when 2+ clips exist, keeping single-photo clean). */}
      {transitionIds && onSelectTransition && boundaryCenters.length > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {boundaryCenters.map((cx, i) => {
            const presetId = transitionIds[i] ?? null;
            const hasTransition = !!presetId;
            return (
              <Pressable
                key={`transition-${i}`}
                onPress={() => handleTransitionPress(i)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={
                  hasTransition ? `Transition ${presetId}, tap to change` : 'Add transition between clips'
                }
                accessibilityHint="Opens the transition picker for this clip boundary"
                accessibilityRole="button"
                style={[
                  trackStyles.transitionIcon,
                  {
                    left: cx - TRANSITION_ICON_SIZE / 2,
                    backgroundColor: hasTransition ? colors.brand : colors.surface,
                    borderColor: hasTransition ? colors.brand : colors.border,
                  },
                ]}
              >
                <Ionicons
                  name={hasTransition ? 'swap-horizontal' : 'add'}
                  size={14}
                  color={hasTransition ? colors.textInverse : colors.textSecondary}
                />
              </Pressable>
            );
          })}
        </View>
      )}

      {trackWidth > 0 && totalDurationMs > 0 && (
        <Playhead
          positionMs={playheadMs}
          totalDurationMs={totalDurationMs}
          trackWidth={trackWidth}
          onSeek={onSeek}
        />
      )}
    </View>
  );
});

const trackStyles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: RadiusRoleValue.mediaThumbnail,
    overflow: 'hidden',
    paddingHorizontal: Space.xxs,
  },
  clipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  // Transition icon — a compact 22pt circle centered on the clip boundary.
  // The visible glyph is 14pt; the 22pt circle is the visual anchor. The
  // hitSlop on the Pressable extends the tap target to ~42pt (AGENTS.md §13).
  transitionIcon: {
    position: 'absolute',
    top: '50%',
    marginTop: -TRANSITION_ICON_SIZE / 2,
    width: TRANSITION_ICON_SIZE,
    height: TRANSITION_ICON_SIZE,
    borderRadius: TRANSITION_ICON_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
});
