import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';

export type FramePublishState = 'idle' | 'uploading' | 'uploaded' | 'failed';

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
  onRemoveFrame?: (index: number) => void;
  onMoveFrame?: (fromIndex: number, toIndex: number) => void;
  onDuplicateFrame?: (index: number) => void;
  onReorder?: (from: number, to: number) => void;
  maxFrames?: number;
  publishStates?: Record<string, FramePublishState>;
}

export function PosterFrameStrip({
  frames,
  activeIndex,
  onSelectIndex,
  onAddFrame,
  onRemoveFrame,
  onMoveFrame,
  onDuplicateFrame,
  maxFrames = 10,
  publishStates,
}: PosterFrameStripProps) {
  const canAdd = frames.length < maxFrames;
  const activeFrame = frames[activeIndex];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel="Frame strip"
      >
        {frames.map((frame, index) => {
          const pubState = publishStates?.[frame.id] ?? 'idle';
          return (
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
                    <Text
                      style={[
                        styles.textFrameLabel,
                        { color: frame.backgroundColor === '#ffffff' ? '#000' : '#fff' },
                      ]}
                      numberOfLines={2}
                    >
                      {frame.caption || 'Text'}
                    </Text>
                  </View>
                ) : frame.mediaUri ? (
                  <View style={styles.mediaFramePreview}>
                    {frame.mediaType === 'video' ? (
                      <>
                        <Image
                          source={{ uri: frame.mediaUri }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                        <View style={styles.videoIconOverlay}>
                          <Ionicons name="videocam" size={12} color="#fff" />
                        </View>
                      </>
                    ) : (
                      <Image
                        source={{ uri: frame.mediaUri }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    )}
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

              {/* Publish state indicator */}
              {pubState === 'uploading' && (
                <View style={styles.pubStateBadge}>
                  <ActivityIndicator size="small" color={Colors.brand} />
                </View>
              )}
              {pubState === 'uploaded' && (
                <View style={styles.pubStateBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#4cd964" />
                </View>
              )}
              {pubState === 'failed' && (
                <View style={styles.pubStateBadge}>
                  <Ionicons name="warning" size={14} color="#ff6b6b" />
                </View>
              )}

              <View style={styles.frameNumber}>
                <Text style={styles.frameNumberText}>{index + 1}</Text>
              </View>
            </Pressable>
          );
        })}

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

      {/* Frame operations for active frame */}
      {activeFrame && frames.length > 0 && (
        <View style={styles.frameOps}>
          {onMoveFrame && activeIndex > 0 && (
            <Pressable
              style={styles.frameOpBtn}
              onPress={() => onMoveFrame(activeIndex, activeIndex - 1)}
              accessibilityLabel="Move frame left"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.frameOpLabel}>Left</Text>
            </Pressable>
          )}
          {onMoveFrame && activeIndex < frames.length - 1 && (
            <Pressable
              style={styles.frameOpBtn}
              onPress={() => onMoveFrame(activeIndex, activeIndex + 1)}
              accessibilityLabel="Move frame right"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-forward-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.frameOpLabel}>Right</Text>
            </Pressable>
          )}
          {onDuplicateFrame && frames.length < maxFrames && (
            <Pressable
              style={styles.frameOpBtn}
              onPress={() => onDuplicateFrame(activeIndex)}
              accessibilityLabel="Duplicate frame"
              accessibilityRole="button"
            >
              <Ionicons name="copy-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.frameOpLabel}>Duplicate</Text>
            </Pressable>
          )}
          {onRemoveFrame && frames.length > 1 && (
            <Pressable
              style={styles.frameOpBtn}
              onPress={() => onRemoveFrame(activeIndex)}
              accessibilityLabel="Remove frame"
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
              <Text style={[styles.frameOpLabel, { color: '#ff6b6b' }]}>Remove</Text>
            </Pressable>
          )}
        </View>
      )}
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
  videoIconOverlay: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  textFramePreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  textFrameLabel: {
    fontSize: 8,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
  },
  pubStateBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
  frameOps: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.md,
    paddingTop: Space.xs,
    paddingHorizontal: Space.md,
  },
  frameOpBtn: {
    alignItems: 'center',
    gap: 2,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  frameOpLabel: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
});
