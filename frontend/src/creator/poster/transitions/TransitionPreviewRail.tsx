/**
 * TransitionPreviewRail — horizontal scrollable rail of transition previews.
 *
 * Each item is a 64pt-wide cell showing the preset's icon and name. Selecting
 * a preset fires a light haptic and calls `onSelect`. The selected item gets a
 * 2pt brand border (Stroke.emphasis — selection grammar per designTokens).
 *
 * When `fromThumbnailUri` / `toThumbnailUri` are provided, the cell renders a
 * looping two-layer micro-preview above the icon — crossfade, slide, zoom or
 * spin per preset type, timed from the preset's own durationMs (capped at
 * 600ms for the preview loop). Reduced motion renders the layers static;
 * otherwise the icon alone communicates the style.
 *
 * Design references:
 *   - AGENTS.md §11: selecting a preset performs a real action via onSelect.
 *   - designTokens Stroke.emphasis (2pt) for selection borders only.
 *   - useHaptic `selection` for the tap acknowledgement.
 */

import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, Image, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { TransitionPreset } from './TransitionTypes';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { Motion } from '../../../theme/motionTokens';
import { Space, Radius, Stroke, FontFamily, FontSize, LetterSpacing, IconGrammar } from '../../../theme/designTokens';

export interface TransitionPreviewRailProps {
  presets: TransitionPreset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fromThumbnailUri?: string;
  toThumbnailUri?: string;
}

const CELL_WIDTH = 64;
const THUMB_HEIGHT = 36;
const PREVIEW_WIDTH = 44;
const PREVIEW_MIN_LOOP_MS = 200;
const PREVIEW_MAX_LOOP_MS = 600;

type PreviewKind = 'none' | 'opacity' | 'translateX' | 'scale' | 'rotate';

function previewKindFor(type: TransitionPreset['type']): PreviewKind {
  switch (type) {
    case 'fade':
    case 'dissolve':
    case 'flash':
      return 'opacity';
    case 'slide':
    case 'wipe':
      return 'translateX';
    case 'zoom':
      return 'scale';
    case 'spin':
      return 'rotate';
    case 'cut':
    default:
      return 'none';
  }
}

// ── Per-cell looping micro-preview ────────────────────────────────────
// Two stacked layers (from-frame + to-frame). The top layer loops per the
// preset's motion family: opacity crossfade, translateX slide-in, scale
// zoom, or rotation. One shared progress value drives every kind, so each
// cell costs a single animated value and two views.
const PresetPreview = React.memo(function PresetPreview({
  preset,
  fromUri,
  toUri,
}: {
  preset: TransitionPreset;
  fromUri?: string;
  toUri?: string;
}) {
  const { colors } = useAppTheme();
  const { isReducedMotion } = useMotionConfig();
  const kind = previewKindFor(preset.type);
  const loopMs = Math.min(Math.max(preset.durationMs, PREVIEW_MIN_LOOP_MS), PREVIEW_MAX_LOOP_MS);
  const progressSV = useSharedValue(0);

  React.useEffect(() => {
    if (isReducedMotion || kind === 'none') return;
    progressSV.value = 0;
    progressSV.value = withRepeat(
      withTiming(1, { duration: loopMs, easing: Motion.easing.smooth }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(progressSV);
    };
  }, [isReducedMotion, kind, loopMs, progressSV]);

  const topLayerAnimStyle = useAnimatedStyle(() => {
    const p = progressSV.value;
    switch (kind) {
      case 'opacity':
        return { opacity: p };
      case 'translateX':
        return { transform: [{ translateX: -PREVIEW_WIDTH * (1 - p) }] };
      case 'scale':
        return { transform: [{ scale: 0.55 + 0.45 * p }] };
      case 'rotate':
        return { transform: [{ rotate: `${360 * p}deg` }] };
      default:
        return {};
    }
  });

  const baseUri = fromUri ?? toUri;
  const topUri = toUri ?? fromUri;
  const animateTopLayer = kind !== 'none' && !isReducedMotion;

  return (
    <View
      style={[
        styles.previewFrame,
        { backgroundColor: colors.surfaceAlt, borderColor: colors.borderSubtle },
      ]}
    >
      <View style={styles.previewLayer}>
        {baseUri ? <Image source={{ uri: baseUri }} style={styles.previewImage} /> : null}
      </View>
      {animateTopLayer ? (
        <Reanimated.View style={[styles.previewLayer, topLayerAnimStyle]}>
          {topUri ? <Image source={{ uri: topUri }} style={styles.previewImage} /> : null}
        </Reanimated.View>
      ) : (
        <View style={styles.previewLayer}>
          {topUri ? <Image source={{ uri: topUri }} style={styles.previewImage} /> : null}
        </View>
      )}
    </View>
  );
});

export function TransitionPreviewRail({
  presets,
  selectedId,
  onSelect,
  fromThumbnailUri,
  toThumbnailUri,
}: TransitionPreviewRailProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const hasThumbs = Boolean(fromThumbnailUri || toThumbnailUri);

  const handleSelect = (id: string) => {
    haptic.selection();
    onSelect(id);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="list"
      accessibilityLabel="Transition presets"
    >
      {presets.map((preset) => {
        const selected = preset.id === selectedId;
        return (
          <Pressable
            key={preset.id}
            onPress={() => handleSelect(preset.id)}
            accessibilityRole="button"
            accessibilityLabel={`${preset.name} transition${selected ? ', selected' : ''}`}
            accessibilityHint={`Apply the ${preset.name} transition to this frame boundary`}
            style={[
              styles.cell,
              {
                width: CELL_WIDTH,
                borderColor: selected ? colors.brand : 'transparent',
                backgroundColor: selected ? colors.brandSubtle : colors.surface,
              },
            ]}
          >
            {hasThumbs && (
              <PresetPreview
                preset={preset}
                fromUri={fromThumbnailUri}
                toUri={toThumbnailUri}
              />
            )}
            <Ionicons
              name={preset.icon}
              size={IconGrammar.standard}
              color={selected ? colors.brand : colors.textPrimary}
            />
            <Text
              style={[
                styles.name,
                {
                  color: selected ? colors.brand : colors.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {preset.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.sm,
    gap: Space.sm,
    alignItems: 'center',
    paddingVertical: Space.xs,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: Stroke.emphasis,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.xxs,
    minHeight: 64,
  },
  previewFrame: {
    width: PREVIEW_WIDTH,
    height: THUMB_HEIGHT,
    marginBottom: Space.xs,
    borderRadius: Radius.sm,
    borderWidth: Stroke.hairline,
    overflow: 'hidden',
  },
  previewLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  name: {
    marginTop: Space.xxs,
    fontFamily: FontFamily.medium,
    fontSize: FontSize.caption,
    letterSpacing: LetterSpacing.normal,
  },
});
