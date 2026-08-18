import React, { useCallback } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Space } from '../../../theme/designTokens';
import { RadiusRoleValue } from '../../../theme/surfaceRadiusRules';
import { useAppTheme } from '../../../theme/ThemeContext';
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

export interface TimelineTrackProps {
  clips: PosterClip[];
  selectedClipId: string | null;
  playheadMs: number;
  totalDurationMs: number;
  onSelectClip: (id: string) => void;
  onSeek: (ms: number) => void;
  onTrimClip: (clipId: string, edge: 'start' | 'end', deltaMs: number) => void;
}

export const TimelineTrack = React.memo(function TimelineTrack({
  clips,
  selectedClipId,
  playheadMs,
  totalDurationMs,
  onSelectClip,
  onSeek,
  onTrimClip,
}: TimelineTrackProps) {
  const { colors } = useAppTheme();
  const widthSV = useSharedValue(0);
  const [trackWidth, setTrackWidth] = React.useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthSV.value = w;
    setTrackWidth(w);
  }, [widthSV]);

  const pxPerMs = trackWidth > 0 && totalDurationMs > 0 ? trackWidth / totalDurationMs : 0;

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
});
