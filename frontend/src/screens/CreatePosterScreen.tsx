import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
import { PosterFrameStrip, ComposerFrame, FramePublishState } from '../components/poster/PosterFrameStrip';
import { PosterFrameComposer } from '../components/poster/PosterFrameComposer';
import { PosterFrameCanvas } from '../components/poster/PosterFrameCanvas';
import { createStableId } from '../utils/createStableId';

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = Math.min(SCREEN_W - 40, 360);
const CANVAS_H = CANVAS_W * (16 / 9);

type Props = StackScreenProps<RootStackParamList, 'CreatePoster'>;

const MAX_FRAMES = 10;
const DEFAULT_DURATION_MS = 5000;

type UploadedMediaCache = Record<string, string>;

function createBlankFrame(): ComposerFrame {
  return {
    id: createStableId('frame'),
    mediaType: 'text',
    mediaUri: null,
    backgroundColor: '#1a1a1a',
    caption: '',
    durationMs: DEFAULT_DURATION_MS,
    stickers: [],
  };
}

function validateFrames(frames: ComposerFrame[]): string | null {
  if (frames.length < 1) return 'A story needs at least one frame';
  if (frames.length > MAX_FRAMES) return `Maximum ${MAX_FRAMES} frames per story`;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.mediaType === 'text' && !f.mediaUri) {
      if (!f.caption.trim() && f.stickers.length === 0) {
        return `Frame ${i + 1} needs text or a sticker`;
      }
    }
    if ((f.mediaType === 'image' || f.mediaType === 'video') && !f.mediaUri) {
      return `Frame ${i + 1} is missing media`;
    }
    for (const s of f.stickers) {
      if (s.x < 0 || s.x > 1 || s.y < 0 || s.y > 1) {
        return `Frame ${i + 1} has a sticker with invalid position`;
      }
      if (s.scale < 0.4 || s.scale > 3) {
        return `Frame ${i + 1} has a sticker with invalid scale`;
      }
      if (s.type === 'style_vote') {
        const payload = s.payload as Record<string, unknown>;
        const question = payload.question as string | undefined;
        const options = payload.options as Array<{ id: string; label: string }> | undefined;
        if (!question?.trim()) {
          return `Frame ${i + 1} has a style vote with no question`;
        }
        if (!options || options.length !== 2) {
          return `Frame ${i + 1} has a style vote needing exactly 2 options`;
        }
        if (!options[0].label.trim() || !options[1].label.trim()) {
          return `Frame ${i + 1} has a style vote with empty options`;
        }
        if (options[0].id === options[1].id) {
          return `Frame ${i + 1} has a style vote with duplicate option IDs`;
        }
      }
    }
  }
  return null;
}

export default function CreatePosterScreen({ navigation }: Props) {
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);

  const [phase, setPhase] = useState<'editing' | 'preview'>('editing');
  const [frames, setFrames] = useState<ComposerFrame[]>([createBlankFrame()]);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [audience, setAudience] = useState<'public' | 'private'>('public');
  const [allowReplies, setAllowReplies] = useState(true);
  const [allowReactions, setAllowReactions] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [publishStates, setPublishStates] = useState<Record<string, FramePublishState>>({});
  const [publishProgress, setPublishProgress] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  const uploadCacheRef = useRef<UploadedMediaCache>({});
  const publishInFlightRef = useRef(false);
  const allowNavigationRef = useRef(false);
  const initialFramesRef = useRef<string>(JSON.stringify(frames));

  const activeFrame = frames[activeFrameIndex];
  const hasContent = useMemo(() =>
    frames.some((f) => f.mediaUri || f.caption.trim() || f.stickers.length > 0),
    [frames]
  );

  const isDirty = useMemo(() => {
    return JSON.stringify(frames) !== initialFramesRef.current;
  }, [frames]);

  // ── Frame operations ──

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
    setSelectedStickerId(null);
  }, [activeFrameIndex]);

  const addFrame = useCallback(() => {
    if (frames.length >= MAX_FRAMES) {
      show(`Maximum ${MAX_FRAMES} frames per story`, 'info');
      return;
    }
    const newFrame = createBlankFrame();
    setFrames((prev) => [...prev, newFrame]);
    setActiveFrameIndex(frames.length);
    setSelectedStickerId(null);
  }, [frames.length, show]);

  const removeFrame = useCallback((index: number) => {
    if (frames.length <= 1) {
      show('A story needs at least one frame', 'info');
      return;
    }
    const removedFrame = frames[index];
    const mediaUri = removedFrame.mediaUri;
    setFrames((prev) => prev.filter((_, i) => i !== index));
    setActiveFrameIndex((prev) => {
      if (prev === index) {
        return Math.max(0, index < frames.length - 1 ? index : index - 1);
      }
      return prev > index ? prev - 1 : prev;
    });
    setSelectedStickerId(null);

    if (mediaUri) {
      const stillUsed = frames.some((f, i) => i !== index && f.mediaUri === mediaUri);
      if (!stillUsed) {
        delete uploadCacheRef.current[mediaUri];
      }
    }
  }, [frames, show]);

  const moveFrame = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= frames.length) return;
    setFrames((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setActiveFrameIndex(toIndex);
  }, [frames.length]);

  const duplicateFrame = useCallback((index: number) => {
    if (frames.length >= MAX_FRAMES) {
      show(`Maximum ${MAX_FRAMES} frames per story`, 'info');
      return;
    }
    const source = frames[index];
    const newFrame: ComposerFrame = {
      ...source,
      id: createStableId('frame'),
      stickers: source.stickers.map((s) => ({
        ...s,
        id: createStableId('sticker'),
      })),
    };
    setFrames((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, newFrame);
      return next;
    });
    setActiveFrameIndex(index + 1);
    setSelectedStickerId(null);
  }, [frames, show]);

  // ── Selection management ──

  const handleSelectSticker = useCallback((id: string | null) => {
    setSelectedStickerId(id);
  }, []);

  // Clear selection when switching frames
  useEffect(() => {
    setSelectedStickerId(null);
  }, [activeFrameIndex]);

  // ── Unsaved-change guard ──

  const proceedWithNavigation = useCallback((action: Parameters<typeof navigation.dispatch>[0]) => {
    allowNavigationRef.current = true;
    navigation.dispatch(action);
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event: { preventDefault: () => void; data: { action: Parameters<typeof navigation.dispatch>[0] } }) => {
      if (allowNavigationRef.current || !isDirty) {
        return;
      }
      event.preventDefault();
      Alert.alert(
        'Discard this Poster?',
        'Your Story has not been shared.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => proceedWithNavigation(event.data.action),
          },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isDirty, proceedWithNavigation]);

  // ── Publishing ──

  const handlePublish = async () => {
    if (publishInFlightRef.current) return;
    publishInFlightRef.current = true;

    const validationError = validateFrames(frames);
    if (validationError) {
      show(validationError, 'error');
      const errorFrameIndex = frames.findIndex((f, i) => {
        if (f.mediaType === 'text' && !f.mediaUri && (!f.caption.trim() && f.stickers.length === 0)) return true;
        if ((f.mediaType === 'image' || f.mediaType === 'video') && !f.mediaUri) return true;
        return false;
      });
      if (errorFrameIndex >= 0) setActiveFrameIndex(errorFrameIndex);
      setPhase('editing');
      publishInFlightRef.current = false;
      return;
    }

    if (!currentUser) {
      show('Sign in to publish your story', 'error');
      navigation.navigate('Login');
      publishInFlightRef.current = false;
      return;
    }

    setIsPublishing(true);

    try {
      const cache = uploadCacheRef.current;
      const framesToUpload = frames.filter((f) => f.mediaUri);
      const uniqueUris = [...new Set(framesToUpload.map((f) => f.mediaUri!))];
      const uncachedUris = uniqueUris.filter((uri) => !cache[uri]);

      // Upload uncached media one by one
      for (let i = 0; i < uncachedUris.length; i++) {
        const uri = uncachedUris[i];
        const owningFrame = framesToUpload.find((f) => f.mediaUri === uri)!;
        setPublishStates((prev) => ({ ...prev, [owningFrame.id]: 'uploading' }));
        setPublishProgress(`Uploading ${i + 1} of ${uncachedUris.length}`);
        try {
          const url = await uploadMedia(uri, 'posters');
          cache[uri] = url;
          setPublishStates((prev) => ({ ...prev, [owningFrame.id]: 'uploaded' }));
        } catch {
          setPublishStates((prev) => ({ ...prev, [owningFrame.id]: 'failed' }));
          throw new Error(`Failed to upload media for frame ${owningFrame.id}`);
        }
      }

      // Mark frames without media as uploaded
      for (const f of frames) {
        if (!f.mediaUri) {
          setPublishStates((prev) => ({ ...prev, [f.id]: 'uploaded' }));
        }
      }

      setPublishProgress('Publishing Poster…');

      const storyId = createStableId('story');

      const uploadedFrames = frames.map((frame, index) => {
        let mediaUrl: string | undefined;
        if (frame.mediaUri) {
          mediaUrl = cache[frame.mediaUri];
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
      });

      const result = await createPosterStory({
        id: storyId,
        audience,
        allowReplies,
        allowReactions,
        expiresInHours: 24,
        frames: uploadedFrames,
      });

      const confirmedStoryId = result.storyId;

      // Clear upload cache on success
      uploadCacheRef.current = {};

      show('Poster story published', 'success');

      // Set one-use navigation bypass
      allowNavigationRef.current = true;
      navigation.replace('PosterViewer', {
        storyId: confirmedStoryId,
      });
    } catch (e) {
      const msg = typeof e === 'object' && e && 'message' in e ? String((e as Error).message) : 'Failed to publish story';
      show(msg, 'error');
      // Retain cache for retry — don't clear on failure
    } finally {
      setIsPublishing(false);
      setPublishProgress(null);
      publishInFlightRef.current = false;
    }
  };

  const handleClose = () => {
    if (isDirty) {
      Alert.alert('Discard this Poster?', 'Your Story has not been shared.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => {
          allowNavigationRef.current = true;
          navigation.goBack();
        }},
      ]);
    } else {
      navigation.goBack();
    }
  };

  // ── Preview navigation ──

  const handlePreviewNext = useCallback(() => {
    setPreviewIndex((prev) => Math.min(prev + 1, frames.length - 1));
  }, [frames.length]);

  const handlePreviewPrev = useCallback(() => {
    setPreviewIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const previewFrame = frames[previewIndex];

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
            onPress={() => {
              setPhase('editing');
              setActiveFrameIndex(previewIndex);
            }}
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
              selectedStickerId={selectedStickerId}
              onSelectSticker={handleSelectSticker}
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
          {previewFrame && (
            <View style={styles.previewCanvasWrap}>
              <PosterFrameCanvas
                frame={previewFrame}
                mode="preview"
                width={CANVAS_W}
                height={CANVAS_H}
              />

              {/* Progress segments */}
              {frames.length > 1 && (
                <View style={styles.progressSegments}>
                  {frames.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.segment,
                        i === previewIndex && styles.segmentActive,
                      ]}
                    />
                  ))}
                </View>
              )}

              {/* Prev/next controls */}
              {frames.length > 1 && (
                <View style={styles.previewNav}>
                  <Pressable
                    onPress={handlePreviewPrev}
                    disabled={previewIndex === 0}
                    style={[styles.navBtn, previewIndex === 0 && styles.navBtnDisabled]}
                    accessibilityLabel="Previous frame"
                    accessibilityRole="button"
                  >
                    <Ionicons name="chevron-back" size={24} color="#fff" />
                  </Pressable>
                  <Pressable
                    onPress={handlePreviewNext}
                    disabled={previewIndex === frames.length - 1}
                    style={[styles.navBtn, previewIndex === frames.length - 1 && styles.navBtnDisabled]}
                    accessibilityLabel="Next frame"
                    accessibilityRole="button"
                  >
                    <Ionicons name="chevron-forward" size={24} color="#fff" />
                  </Pressable>
                </View>
              )}

              {/* Frame position */}
              <Text style={styles.framePosition}>
                {previewIndex + 1} / {frames.length}
              </Text>
            </View>
          )}
        </View>
      )}

      <PosterFrameStrip
        frames={frames}
        activeIndex={phase === 'editing' ? activeFrameIndex : previewIndex}
        onSelectIndex={phase === 'editing' ? setActiveFrameIndex : setPreviewIndex}
        onAddFrame={addFrame}
        onRemoveFrame={removeFrame}
        onMoveFrame={moveFrame}
        onDuplicateFrame={duplicateFrame}
        maxFrames={MAX_FRAMES}
        publishStates={publishStates}
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
        </View>
      )}

      <View style={styles.publishBar}>
        {publishProgress && (
          <Text style={styles.publishProgress}>{publishProgress}</Text>
        )}
        {phase === 'editing' ? (
          <AnimatedPressable
            style={styles.publishBtn}
            onPress={() => {
              setPreviewIndex(activeFrameIndex);
              setPhase('preview');
            }}
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
  },
  previewCanvasWrap: {
    alignItems: 'center',
    gap: Space.sm,
  },
  progressSegments: {
    flexDirection: 'row',
    gap: 4,
    marginTop: Space.sm,
  },
  segment: {
    width: 24,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.border,
  },
  segmentActive: {
    backgroundColor: Colors.brand,
  },
  previewNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: CANVAS_W,
    marginTop: Space.sm,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  framePosition: {
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
  publishBar: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  publishProgress: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Space.xs,
  },
  publishBtn: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
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
