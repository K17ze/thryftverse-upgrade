import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';

export interface ComposerFrame {
  id: string;
  mediaType: 'image' | 'video' | 'text';
  mediaUri: string | null;
  backgroundColor: string | null;
  caption: string;
  durationMs: number;
  stickers: Array<{
    id: string;
    type: 'text' | 'mention' | 'listing' | 'look' | 'style_vote';
    x: number;
    y: number;
    scale: number;
    rotation: number;
    payload: Record<string, unknown>;
    sortOrder: number;
  }>;
}

interface PosterFrameStripProps {
  frames: ComposerFrame[];
  activeIndex: number;
  onSelectIndex: (index: number) => void;
  onAddFrame: () => void;
  onReorder?: (from: number, to: number) => void;
  maxFrames?: number;
}

export function PosterFrameStrip({
  frames,
  activeIndex,
  onSelectIndex,
  onAddFrame,
  maxFrames = 10,
}: PosterFrameStripProps) {
  const canAdd = frames.length < maxFrames;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel="Frame strip"
      >
        {frames.map((frame, index) => (
          <Pressable
            key={frame.id}
            onPress={() => onSelectIndex(index)}
            style={[
              styles.frameThumb,
              index === activeIndex && styles.frameThumbActive,
            ]}
            accessibilityLabel={`Frame ${index + 1}${index === activeIndex ? ' (active)' : ''}`}
            accessibilityRole="button"
          >
            <View style={styles.frameThumbInner}>
              {frame.mediaType === 'text' && !frame.mediaUri ? (
                <View style={[styles.textFramePreview, { backgroundColor: frame.backgroundColor ?? '#1a1a1a' }]}>
                  <Text style={styles.textFrameLabel} numberOfLines={2}>{frame.caption || 'Text'}</Text>
                </View>
              ) : (
                <View style={styles.mediaFramePreview}>
                  <Ionicons
                    name={frame.mediaType === 'video' ? 'videocam' : 'image'}
                    size={16}
                    color={Colors.textMuted}
                  />
                </View>
              )}
            </View>
            <View style={styles.frameNumber}>
              <Text style={styles.frameNumberText}>{index + 1}</Text>
            </View>
          </Pressable>
        ))}

        {canAdd && (
          <Pressable
            onPress={onAddFrame}
            style={styles.addFrame}
            accessibilityLabel="Add new frame"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={22} color={Colors.textSecondary} />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const THUMB_SIZE = 52;

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.sm,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    alignItems: 'center',
  },
  frameThumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE * (16 / 9),
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  frameThumbActive: {
    borderColor: Colors.brand,
  },
  frameThumbInner: {
    flex: 1,
    borderRadius: Radius.sm - 2,
    overflow: 'hidden',
  },
  mediaFramePreview: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textFramePreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  textFrameLabel: {
    color: '#fff',
    fontSize: 8,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
  },
  frameNumber: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 6,
    width: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameNumberText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: Typography.family.semibold,
  },
  addFrame: {
    width: THUMB_SIZE,
    height: THUMB_SIZE * (16 / 9),
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
});
