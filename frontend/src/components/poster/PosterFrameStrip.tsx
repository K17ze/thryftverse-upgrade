import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, Modal } from 'react-native';
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
  videoDurationMs?: number | null;
  thumbnailUri?: string | null;
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
  maxFrames?: number;
  publishStates?: Record<string, FramePublishState>;
  posterMode?: 'poster' | 'look';
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
  posterMode = 'poster',
}: PosterFrameStripProps) {
  const canAdd = frames.length < maxFrames;
  const activeFrame = frames[activeIndex];
  const thumbAspect = posterMode === 'look' ? (4 / 3) : (16 / 9);
  const thumbHeight = Math.round(THUMB_SIZE * thumbAspect);

  const [contextMenuIndex, setContextMenuIndex] = useState<number | null>(null);

  const handleContextAction = useCallback((action: 'moveLeft' | 'moveRight' | 'duplicate' | 'remove') => {
    if (contextMenuIndex === null) return;
    const idx = contextMenuIndex;
    setContextMenuIndex(null);
    switch (action) {
      case 'moveLeft':
        onMoveFrame?.(idx, idx - 1);
        break;
      case 'moveRight':
        onMoveFrame?.(idx, idx + 1);
        break;
      case 'duplicate':
        onDuplicateFrame?.(idx);
        break;
      case 'remove':
        onRemoveFrame?.(idx);
        break;
    }
  }, [contextMenuIndex, onMoveFrame, onDuplicateFrame, onRemoveFrame]);

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
              onLongPress={() => setContextMenuIndex(index)}
              delayLongPress={400}
              style={[
                styles.frameThumb,
                { height: thumbHeight },
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
                        {frame.thumbnailUri ? (
                          <Image
                            source={{ uri: frame.thumbnailUri }}
                            style={StyleSheet.absoluteFill}
                            resizeMode="cover"
                          />
                        ) : null}
                        <View style={[styles.videoDarkOverlay, !frame.thumbnailUri && StyleSheet.absoluteFill]}>
                          <Ionicons name="videocam" size={16} color="rgba(255,255,255,0.8)" />
                          {frame.videoDurationMs != null && frame.videoDurationMs > 0 && (
                            <Text style={styles.videoDurationLabel}>
                              {Math.round(frame.videoDurationMs / 1000)}s
                            </Text>
                          )}
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
            style={[styles.addFrame, { height: thumbHeight }]}
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

      {/* Context menu modal for long-press on frame thumbnail */}
      <Modal
        visible={contextMenuIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuIndex(null)}
      >
        <Pressable style={styles.contextOverlay} onPress={() => setContextMenuIndex(null)}>
          <Pressable style={styles.contextSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.contextTitle}>
              Frame {contextMenuIndex !== null ? contextMenuIndex + 1 : ''}
            </Text>
            {contextMenuIndex !== null && contextMenuIndex > 0 && (
              <Pressable
                style={styles.contextItem}
                onPress={() => handleContextAction('moveLeft')}
                accessibilityLabel="Move frame left"
                accessibilityRole="button"
              >
                <Ionicons name="chevron-back-outline" size={20} color={Colors.textPrimary} />
                <Text style={styles.contextItemText}>Move left</Text>
              </Pressable>
            )}
            {contextMenuIndex !== null && contextMenuIndex < frames.length - 1 && (
              <Pressable
                style={styles.contextItem}
                onPress={() => handleContextAction('moveRight')}
                accessibilityLabel="Move frame right"
                accessibilityRole="button"
              >
                <Ionicons name="chevron-forward-outline" size={20} color={Colors.textPrimary} />
                <Text style={styles.contextItemText}>Move right</Text>
              </Pressable>
            )}
            {onDuplicateFrame && frames.length < maxFrames && (
              <Pressable
                style={styles.contextItem}
                onPress={() => handleContextAction('duplicate')}
                accessibilityLabel="Duplicate frame"
                accessibilityRole="button"
              >
                <Ionicons name="copy-outline" size={20} color={Colors.textPrimary} />
                <Text style={styles.contextItemText}>Duplicate</Text>
              </Pressable>
            )}
            {onRemoveFrame && frames.length > 1 && (
              <Pressable
                style={styles.contextItem}
                onPress={() => handleContextAction('remove')}
                accessibilityLabel="Remove frame"
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={20} color="#ff6b6b" />
                <Text style={[styles.contextItemText, { color: '#ff6b6b' }]}>Remove</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.contextCancelBtn}
              onPress={() => setContextMenuIndex(null)}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text style={styles.contextCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  videoDarkOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  videoDurationLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 8,
    fontFamily: Typography.family.semibold,
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
  contextOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contextSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
    gap: Space.sm,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Space.sm,
  },
  contextTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.xs,
  },
  contextItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: 12,
    minHeight: 44,
  },
  contextItemText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  contextCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  contextCancelText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
});
