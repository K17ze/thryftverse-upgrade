import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Dimensions,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useToast } from '../context/ToastContext';
import { uploadMedia } from '../services/mediaUpload';
import { createPosterStory } from '../services/postersApi';
import { useStore } from '../store/useStore';
import { PosterFrameStrip, ComposerFrame } from '../components/poster/PosterFrameStrip';
import { PosterFrameComposer } from '../components/poster/PosterFrameComposer';

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = Math.min(SCREEN_W - 40, 360);
const CANVAS_H = CANVAS_W * (16 / 9);

type Props = StackScreenProps<RootStackParamList, 'CreatePoster'>;

const MAX_FRAMES = 10;
const DEFAULT_DURATION_MS = 5000;

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createBlankFrame(): ComposerFrame {
  return {
    id: `frame_${generateUUID()}`,
    mediaType: 'text',
    mediaUri: null,
    backgroundColor: '#1a1a1a',
    caption: '',
    durationMs: DEFAULT_DURATION_MS,
    stickers: [],
  };
}

export default function CreatePosterScreen({ navigation }: Props) {
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);

  const [phase, setPhase] = useState<'editing' | 'preview'>('editing');
  const [frames, setFrames] = useState<ComposerFrame[]>([createBlankFrame()]);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [audience, setAudience] = useState<'public' | 'private'>('public');
  const [allowReplies, setAllowReplies] = useState(true);
  const [allowReactions, setAllowReactions] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const activeFrame = frames[activeFrameIndex];
  const hasContent = useMemo(() =>
    frames.some((f) => f.mediaUri || f.caption.trim() || f.stickers.length > 0),
    [frames]
  );

  const updateFrame = useCallback((updates: Partial<ComposerFrame>) => {
    setFrames((prev) => {
      const next = [...prev];
      next[activeFrameIndex] = { ...next[activeFrameIndex], ...updates };
      return next;
    });
  }, [activeFrameIndex]);

  const addSticker = useCallback((sticker: ComposerFrame['stickers'][0]) => {
    setFrames((prev) => {
      const next = [...prev];
      next[activeFrameIndex] = {
        ...next[activeFrameIndex],
        stickers: [...next[activeFrameIndex].stickers, sticker],
      };
      return next;
    });
  }, [activeFrameIndex]);

  const updateSticker = useCallback((id: string, updates: Partial<ComposerFrame['stickers'][0]>) => {
    setFrames((prev) => {
      const next = [...prev];
      next[activeFrameIndex] = {
        ...next[activeFrameIndex],
        stickers: next[activeFrameIndex].stickers.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        ),
      };
      return next;
    });
  }, [activeFrameIndex]);

  const removeSticker = useCallback((id: string) => {
    setFrames((prev) => {
      const next = [...prev];
      next[activeFrameIndex] = {
        ...next[activeFrameIndex],
        stickers: next[activeFrameIndex].stickers.filter((s) => s.id !== id),
      };
      return next;
    });
  }, [activeFrameIndex]);

  const addFrame = useCallback(() => {
    if (frames.length >= MAX_FRAMES) {
      show(`Maximum ${MAX_FRAMES} frames per story`, 'info');
      return;
    }
    const newFrame = createBlankFrame();
    setFrames((prev) => [...prev, newFrame]);
    setActiveFrameIndex(frames.length);
  }, [frames.length, show]);

  const removeFrame = useCallback((index: number) => {
    if (frames.length <= 1) {
      show('A story needs at least one frame', 'info');
      return;
    }
    setFrames((prev) => prev.filter((_, i) => i !== index));
    setActiveFrameIndex((prev) => Math.max(0, prev >= index ? prev - 1 : prev));
  }, [frames.length, show]);

  const handleClose = () => {
    if (hasContent) {
      Alert.alert('Discard story?', 'Your poster story will not be saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  };

  const handlePublish = async () => {
    if (!hasContent) {
      show('Add content to at least one frame', 'error');
      return;
    }
    if (!currentUser) {
      show('Sign in to publish your story', 'error');
      navigation.navigate('Login');
      return;
    }

    setIsPublishing(true);
    try {
      const storyId = `story_${generateUUID()}`;

      const uploadedFrames = await Promise.all(
        frames.map(async (frame, index) => {
          let mediaUrl: string | undefined;
          if (frame.mediaUri) {
            mediaUrl = await uploadMedia(frame.mediaUri, 'posters');
          }
          return {
            id: frame.id,
            mediaType: frame.mediaType,
            mediaUrl,
            backgroundColor: frame.backgroundColor ?? undefined,
            caption: frame.caption.trim() || undefined,
            durationMs: frame.durationMs,
            sortOrder: index,
            stickers: frame.stickers.map((s, sIdx) => ({
              id: s.id,
              type: s.type,
              x: s.x,
              y: s.y,
              scale: s.scale,
              rotation: s.rotation,
              payload: s.payload as Record<string, unknown>,
              sortOrder: sIdx,
            })),
          };
        })
      );

      await createPosterStory({
        id: storyId,
        audience,
        allowReplies,
        allowReactions,
        expiresInHours: 24,
        frames: uploadedFrames,
      });

      show('Poster story published', 'success');
      navigation.goBack();
    } catch (e) {
      show(
        typeof e === 'object' && e && 'message' in e ? String((e as Error).message) : 'Failed to publish story',
        'error'
      );
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.topBar}>
        <AnimatedPressable
          onPress={handleClose}
          style={styles.iconBtn}
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
        >
          <Ionicons name="close" size={26} color={Colors.textPrimary} />
        </AnimatedPressable>

        <Text style={styles.topTitle}>
          {phase === 'editing' ? 'Create Story' : 'Preview'}
        </Text>

        {phase === 'editing' ? (
          <AnimatedPressable
            onPress={() => setShowSettings(!showSettings)}
            style={styles.iconBtn}
            activeOpacity={0.7}
            scaleValue={0.9}
            hapticFeedback="light"
          >
            <Ionicons name="settings-outline" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
        ) : (
          <AnimatedPressable
            onPress={() => setPhase('editing')}
            style={styles.iconBtn}
            activeOpacity={0.7}
            scaleValue={0.9}
            hapticFeedback="light"
          >
            <Ionicons name="create-outline" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
        )}
      </View>

      {phase === 'editing' ? (
        <View style={styles.editorBody}>
          {activeFrame && (
            <PosterFrameComposer
              frame={activeFrame}
              onUpdateFrame={updateFrame}
              onAddSticker={addSticker}
              onUpdateSticker={updateSticker}
              onRemoveSticker={removeSticker}
              canvasWidth={CANVAS_W}
              canvasHeight={CANVAS_H}
            />
          )}

          {activeFrame?.mediaType === 'text' && !activeFrame.mediaUri && (
            <TextInput
              style={styles.captionInput}
              placeholder="Type caption or text..."
              placeholderTextColor={Colors.textMuted}
              value={activeFrame.caption}
              onChangeText={(text) => updateFrame({ caption: text })}
              multiline
              maxLength={200}
              accessibilityLabel="Frame caption text"
            />
          )}

          {activeFrame?.mediaUri && (
            <TextInput
              style={styles.captionInput}
              placeholder="Add a caption (optional)..."
              placeholderTextColor={Colors.textMuted}
              value={activeFrame.caption}
              onChangeText={(text) => updateFrame({ caption: text })}
              multiline
              maxLength={200}
              accessibilityLabel="Frame caption text"
            />
          )}
        </View>
      ) : (
        <View style={styles.previewBody}>
          {frames.map((frame, i) => (
            <View
              key={frame.id}
              style={[
                styles.previewFrame,
                i === activeFrameIndex && styles.previewFrameActive,
              ]}
            >
              <View
                style={[
                  styles.previewCanvas,
                  {
                    width: CANVAS_W * 0.7,
                    height: CANVAS_H * 0.7,
                    backgroundColor: frame.backgroundColor ?? Colors.surfaceAlt,
                  },
                ]}
              >
                {frame.mediaUri ? null : (
                  <Text
                    style={[
                      styles.previewText,
                      { color: frame.backgroundColor === '#ffffff' ? '#000' : '#fff' },
                    ]}
                    numberOfLines={3}
                  >
                    {frame.caption || 'Empty frame'}
                  </Text>
                )}
              </View>
              <Text style={styles.previewFrameLabel}>Frame {i + 1}</Text>
            </View>
          ))}
        </View>
      )}

      <PosterFrameStrip
        frames={frames}
        activeIndex={activeFrameIndex}
        onSelectIndex={setActiveFrameIndex}
        onAddFrame={addFrame}
        maxFrames={MAX_FRAMES}
      />

      {showSettings && phase === 'editing' && (
        <View style={styles.settingsSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Story settings</Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Audience</Text>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setAudience('public')}
                style={[styles.toggleBtn, audience === 'public' && styles.toggleBtnActive]}
              >
                <Text style={[styles.toggleText, audience === 'public' && styles.toggleTextActive]}>Public</Text>
              </Pressable>
              <Pressable
                onPress={() => setAudience('private')}
                style={[styles.toggleBtn, audience === 'private' && styles.toggleBtnActive]}
              >
                <Text style={[styles.toggleText, audience === 'private' && styles.toggleTextActive]}>Private</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Allow replies</Text>
            <Pressable
              onPress={() => setAllowReplies(!allowReplies)}
              style={[styles.switch, allowReplies && styles.switchOn]}
              accessibilityLabel={`Allow replies: ${allowReplies ? 'on' : 'off'}`}
              accessibilityRole="switch"
            >
              <View style={[styles.switchThumb, allowReplies && styles.switchThumbOn]} />
            </Pressable>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Allow reactions</Text>
            <Pressable
              onPress={() => setAllowReactions(!allowReactions)}
              style={[styles.switch, allowReactions && styles.switchOn]}
              accessibilityLabel={`Allow reactions: ${allowReactions ? 'on' : 'off'}`}
              accessibilityRole="switch"
            >
              <View style={[styles.switchThumb, allowReactions && styles.switchThumbOn]} />
            </Pressable>
          </View>

          {frames.length > 1 && (
            <Pressable
              onPress={() => removeFrame(activeFrameIndex)}
              style={styles.removeFrameBtn}
            >
              <Ionicons name="trash-outline" size={16} color="#ff6b6b" />
              <Text style={styles.removeFrameText}>Remove frame {activeFrameIndex + 1}</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.publishBar}>
        {phase === 'editing' ? (
          <AnimatedPressable
            style={styles.publishBtn}
            onPress={() => setPhase('preview')}
            activeOpacity={0.85}
            disabled={!hasContent}
          >
            <Text style={styles.publishBtnText}>Preview</Text>
          </AnimatedPressable>
        ) : (
          <AnimatedPressable
            style={[styles.publishBtn, !hasContent && styles.publishBtnDisabled]}
            onPress={handlePublish}
            activeOpacity={0.85}
            disabled={isPublishing || !hasContent}
          >
            {isPublishing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.publishBtnText}>Publish Story</Text>
            )}
          </AnimatedPressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingVertical: 10,
  },
  topTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editorBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    gap: Space.md,
  },
  captionInput: {
    width: CANVAS_W,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    textAlignVertical: 'top',
  },
  previewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
  },
  previewFrame: {
    alignItems: 'center',
    gap: Space.xs,
    opacity: 0.4,
  },
  previewFrameActive: {
    opacity: 1,
  },
  previewCanvas: {
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.md,
  },
  previewText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    textAlign: 'center',
  },
  previewFrameLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  settingsSheet: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Space.md,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
  },
  sheetTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  toggleBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  toggleBtnActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  toggleText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: '#fff',
  },
  switch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchOn: {
    backgroundColor: Colors.brand,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  switchThumbOn: {
    transform: [{ translateX: 18 }],
  },
  removeFrameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  removeFrameText: {
    color: '#ff6b6b',
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  publishBar: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  publishBtn: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  publishBtnDisabled: {
    opacity: 0.5,
  },
  publishBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
});
