import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  useReducedMotion,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { useCreator } from './CreatorContext';
import { CreatorCanvas } from './CreatorCanvas';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { createLookOnApi, updateLookOnApi } from '../services/looksApi';
import { createPosterStory, scheduleCreatorDocument } from '../services/postersApi';
import { CreatorAnalytics } from './creatorAnalytics';
import { uploadAllLocalMedia, hasLocalUris } from './mediaUploadPipeline';
import {
  validateForPublish,
  serialiseToLookPayload,
  serialiseToPosterPayload,
  PublishGuard,
} from './compositionContract';

export interface CreatorPublishSheetProps {
  visible: boolean;
  onClose: () => void;
  editingLookId?: string;
}

export function CreatorPublishSheet({ visible, onClose, editingLookId }: CreatorPublishSheetProps) {
  const { document, saveDraft } = useCreator();
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const [stage, setStage] = useState<'review' | 'uploading' | 'publishing' | 'success' | 'error'>('review');
  const [errorMessage, setErrorMessage] = useState('');
  const [publishedId, setPublishedId] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadFraction, setUploadFraction] = useState(0);
  const [uploadCompleted, setUploadCompleted] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const publishGuardRef = useRef(new PublishGuard());
  const styles = useMemo(() => createStyles(colors), [colors]);

  const progressWidth = useSharedValue(0);

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progressWidth.value * 100)}%`,
  }));

  // Haptic feedback when entering the success state
  useEffect(() => {
    if (stage === 'success') {
      haptic.success();
    }
  }, [stage, haptic]);

  const handleClose = useCallback(() => {
    if (stage === 'publishing' || stage === 'uploading') return;
    haptic.selection();
    setStage('review');
    setErrorMessage('');
    setUploadProgress('');
    setUploadFraction(0);
    setUploadCompleted(0);
    setUploadTotal(0);
    progressWidth.value = 0;
    publishGuardRef.current.reset();
    onClose();
  }, [stage, haptic, onClose, progressWidth]);

  const handlePublish = useCallback(async () => {
    // Prevent duplicate submissions
    if (!publishGuardRef.current.begin(document.id)) {
      return;
    }
    haptic.medium();

    CreatorAnalytics.publishStart(document.type);
    try {
      // 1. Validate the document before any upload
      const validation = validateForPublish(document);
      if (!validation.valid) {
        throw new Error(validation.errors.join('; '));
      }

      let workingDoc = document;

      // 2. Upload all local media URIs before publishing
      if (hasLocalUris(document)) {
        setStage('uploading');
        workingDoc = await uploadAllLocalMedia(document, (progress) => {
          if (progress.total > 0) {
            const fraction = (progress.completed + 1) / progress.total;
            setUploadProgress(`Uploading media ${progress.completed + 1} of ${progress.total}`);
            setUploadTotal(progress.total);
            setUploadCompleted(progress.completed + 1);
            setUploadFraction(fraction);
            progressWidth.value = reduceMotion ? fraction : withTiming(fraction, { duration: 300, easing: Easing.out(Easing.ease) });
          }
        });
      }

      // 3. Re-validate after upload to ensure no local URIs remain
      const postUploadValidation = validateForPublish(workingDoc);
      if (!postUploadValidation.valid) {
        throw new Error(postUploadValidation.errors.join('; '));
      }

      setStage('publishing');
      setUploadProgress('');

      if (workingDoc.type === 'look') {
        // 4. Serialise to canonical look payload
        const { payload } = serialiseToLookPayload(workingDoc);

        // 5. Send real publish request — update existing look or create new
        const result = editingLookId
          ? await updateLookOnApi(editingLookId, payload)
          : await createLookOnApi(payload);

        // 6. If scheduled, set the scheduled_for timestamp on the document
        if (workingDoc.metadata.scheduledFor) {
          try {
            await scheduleCreatorDocument(workingDoc.id, workingDoc.metadata.scheduledFor);
          } catch {
            // Scheduling failure is non-fatal — the content is already published
          }
        }

        // 7. Confirm server success
        publishGuardRef.current.complete(workingDoc.id);
        setPublishedId(result.lookId);
        setStage('success');
        CreatorAnalytics.publishSuccess('look', result.lookId);
      } else {
        // 4. Serialise to canonical poster payload
        const { payload } = serialiseToPosterPayload(workingDoc);

        // 5. Send real publish request
        const result = await createPosterStory(payload);

        // 6. If scheduled, set the scheduled_for timestamp on the document
        if (workingDoc.metadata.scheduledFor) {
          try {
            await scheduleCreatorDocument(workingDoc.id, workingDoc.metadata.scheduledFor);
          } catch {
            // Scheduling failure is non-fatal — the content is already published
          }
        }

        // 7. Confirm server success
        publishGuardRef.current.complete(workingDoc.id);
        setPublishedId(result.storyId);
        setStage('success');
        CreatorAnalytics.publishSuccess('poster', result.storyId);
      }
    } catch (err: unknown) {
      publishGuardRef.current.fail();
      const errorMessage = err instanceof Error ? err.message : 'Publishing failed';
      setErrorMessage(errorMessage);
      setStage('error');
      CreatorAnalytics.publishError(document.type, err instanceof Error ? err.message : 'Unknown error');
    }
  }, [document, editingLookId]);

  if (!visible && stage === 'review') return null;

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
        <View style={styles.header}>
          <Text style={styles.title}>Publish</Text>
          <PressScale onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close publish">
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>

        {stage === 'review' && (
          <PublishReview document={document} onPublish={handlePublish} onSaveDraft={saveDraft} />
        )}

        {stage === 'uploading' && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.centerStateText}>
              {uploadTotal > 0
                ? `Uploading ${uploadCompleted} of ${uploadTotal}...`
                : uploadProgress || 'Uploading media...'}
            </Text>
            <View style={styles.progressBarTrack}>
              <Reanimated.View style={[styles.progressBarFill, progressAnimatedStyle]} />
            </View>
          </View>
        )}

        {stage === 'publishing' && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.centerStateText}>Publishing...</Text>
          </View>
        )}

        {stage === 'success' && (
          <CelebrationSuccess
            colors={colors}
            reduceMotion={reduceMotion}
            springCfg={spring.success}
            publishedId={publishedId}
            documentType={document.type}
            onView={() => {
              haptic.selection();
              onClose();
              setStage('review');
              if (document.type === 'look') {
                navigation.replace('LookDetail', { lookId: publishedId });
              } else {
                navigation.replace('PosterViewer', { storyId: publishedId });
              }
            }}
            onShare={() => { haptic.selection(); }}
          />
        )}

        {stage === 'error' && (
          <View style={styles.centerState}>
            <Ionicons name="warning" size={48} color={colors.danger} />
            <Text style={styles.centerStateTitle}>Publishing failed</Text>
            <Text style={styles.centerStateText}>{errorMessage}</Text>
            <Pressable
              onPress={() => { haptic.medium(); setStage('review'); }}
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
              accessibilityLabel="Retry publish"
              accessibilityRole="button"
              hitSlop={16}
            >
              <Ionicons name="refresh-outline" size={16} color={colors.textInverse} style={{ marginRight: 6 }} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        )}
    </SheetContainer>
  );
}

interface CelebrationSuccessProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  publishedId: string;
  documentType: 'look' | 'poster';
  onView: () => void;
  onShare: () => void;
}

const CONFETTI_COLORS = ['#F4F0E8', '#C9A46A', '#B85566', '#4A7AC4', '#215634', '#9A6B7A', '#8A6A3F'];
const CONFETTI_COUNT = 10;

function CelebrationSuccess({
  colors,
  reduceMotion,
  springCfg,
  onView,
  onShare,
}: CelebrationSuccessProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const checkScale = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(8);

  useEffect(() => {
    if (reduceMotion) {
      checkScale.value = 1;
      titleOpacity.value = 1;
      titleTranslateY.value = 0;
    } else {
      checkScale.value = withSpring(1.2, springCfg, () => {
        checkScale.value = withSpring(1.0, springCfg);
      });
      titleOpacity.value = withDelay(200, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }));
      titleTranslateY.value = withDelay(200, withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }));
    }
  }, [reduceMotion, springCfg, checkScale, titleOpacity, titleTranslateY]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  return (
    <View style={styles.centerState}>
      <View style={styles.successContainer}>
        <Reanimated.View style={[styles.successCircle, checkStyle]}>
          <Ionicons name="checkmark" size={32} color={colors.textInverse} />
        </Reanimated.View>
        {!reduceMotion && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
              <ConfettiParticle key={i} index={i} colors={colors} />
            ))}
          </View>
        )}
      </View>
      <Reanimated.View style={titleStyle}>
        <Text style={styles.successTitle}>Published!</Text>
      </Reanimated.View>
      <Text style={styles.centerStateText}>Your content is now live</Text>
      <Pressable
        onPress={onView}
        style={({ pressed }) => [styles.viewBtn, pressed && { opacity: 0.9 }]}
        accessibilityLabel="View published content"
        accessibilityRole="button"
        hitSlop={16}
      >
        <Text style={styles.viewBtnText}>View</Text>
      </Pressable>
      <Pressable
        onPress={onShare}
        style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.85 }]}
        accessibilityLabel="Share published content"
        accessibilityRole="button"
        hitSlop={16}
      >
        <Ionicons name="share-outline" size={18} color={colors.brand} />
        <Text style={styles.shareBtnText}>Share</Text>
      </Pressable>
    </View>
  );
}

function ConfettiParticle({ index, colors }: { index: number; colors: ThemeColors }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);
  const rotate = useSharedValue(0);

  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const angle = (index / CONFETTI_COUNT) * Math.PI * 2;
  const distance = 60 + (index % 3) * 20;
  const targetX = Math.cos(angle) * distance;
  const targetY = Math.sin(angle) * distance - 20;
  const size = 6 + (index % 3) * 2;

  useEffect(() => {
    opacity.value = withDelay(100 + index * 30, withTiming(1, { duration: 100 }));
    scale.value = withDelay(100 + index * 30, withSpring(1, { damping: 12, stiffness: 160, mass: 0.8 }));
    translateX.value = withDelay(100 + index * 30, withSpring(targetX, { damping: 14, stiffness: 120, mass: 0.9 }));
    translateY.value = withDelay(100 + index * 30, withSpring(targetY + 80, { damping: 10, stiffness: 80, mass: 1.2 }));
    rotate.value = withDelay(100 + index * 30, withSpring((index % 2 ? 1 : -1) * 180, { damping: 14, stiffness: 100, mass: 1.0 }));
    opacity.value = withDelay(900 + index * 30, withTiming(0, { duration: 400 }));
  }, [index, targetX, targetY, opacity, scale, translateX, translateY, rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Reanimated.View
      style={[
        {
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

function PublishReview({
  document,
  onPublish,
  onSaveDraft,
}: {
  document: ReturnType<typeof useCreator>['document'];
  onPublish: () => void;
  onSaveDraft: () => Promise<void>;
}) {
  const { updateMetadata } = useCreator();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const canvasWidth = 280;
  const canvasHeight = Math.floor(canvasWidth / document.canvas.aspectRatio);
  const coverThumbWidth = 100;
  const coverThumbHeight = 125;
  const [saveToCameraRoll, setSaveToCameraRoll] = useState(true);
  const [coverPageIndex, setCoverPageIndex] = useState(0);

  return (
    <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
      {/* Preview — all pages */}
      {document.pages.length > 1 && (
        <Text style={styles.sectionLabel}>Preview ({document.pages.length} pages)</Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.previewScroll}
        contentContainerStyle={styles.previewContainer}
      >
        {document.pages.map((page) => (
          <View key={page.id} style={styles.previewPageWrapper}>
            <CreatorCanvas
              document={document}
              page={page}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              mode="preview"
            />
          </View>
        ))}
      </ScrollView>

      {/* Cover selection — for multi-page stories (Instagram pattern) */}
      {document.pages.length > 1 && (
        <>
          <Text style={styles.sectionLabel}>Cover</Text>
          <Text style={styles.coverHint}>Tap a page to set it as the cover</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coverScroll} contentContainerStyle={styles.coverContainer}>
            {document.pages.map((page, i) => (
              <Pressable
                key={page.id}
                onPress={() => { haptic.selection(); setCoverPageIndex(i); }}
                style={[styles.coverThumbWrap, coverPageIndex === i && styles.coverThumbActive]}
                accessibilityLabel={`Set page ${i + 1} as cover`}
                accessibilityRole="button"
              >
                <CreatorCanvas
                  document={document}
                  page={page}
                  canvasWidth={coverThumbWidth}
                  canvasHeight={coverThumbHeight}
                  mode="preview"
                />
                {coverPageIndex === i && (
                  <View style={styles.coverBadge}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* Caption */}
      <Text style={styles.sectionLabel}>Caption</Text>
      <View style={styles.captionCard}>
        <TextInput
          style={styles.captionInput}
          placeholder="Write a caption..."
          placeholderTextColor={colors.textMuted}
          value={document.metadata.caption}
          onChangeText={(v) => updateMetadata({ caption: v })}
          multiline
          maxLength={500}
          accessibilityLabel="Caption"
        />
        <Text style={styles.captionCount}>{document.metadata.caption.length}/500</Text>
      </View>

      {/* Visibility — 3-option segmented control (Instagram Close Friends pattern) */}
      <Text style={styles.sectionLabel}>Audience</Text>
      <View style={styles.audienceRow}>
        {([
          { key: 'public' as const, label: 'Public', icon: 'globe-outline' as const },
          { key: 'closeFriends' as const, label: 'Close Friends', icon: 'people-outline' as const },
          { key: 'private' as const, label: 'Only Me', icon: 'lock-closed-outline' as const },
        ] as const).map((opt) => {
          const isActive = document.metadata.visibility === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => { haptic.selection(); updateMetadata({ visibility: opt.key }); }}
              style={[styles.audiencePill, isActive && styles.audiencePillActive]}
              accessibilityLabel={`Audience ${opt.label}`}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Ionicons name={opt.icon} size={16} color={isActive ? '#fff' : colors.textSecondary} />
              <Text style={[styles.audiencePillText, isActive && styles.audiencePillTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Save to Camera Roll */}
      <View style={styles.cameraRollRow}>
        <View style={styles.toggleLabelWrap}>
          <Ionicons name="download-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.toggleLabel}>Save to camera roll</Text>
        </View>
        <Switch
          value={saveToCameraRoll}
          onValueChange={(v) => { haptic.selection(); setSaveToCameraRoll(v); }}
          trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
          thumbColor={saveToCameraRoll ? '#fff' : colors.textMuted}
          accessibilityLabel="Save to camera roll"
        />
      </View>

      {/* Poster-specific */}
      {document.type === 'poster' && (
        <>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Allow replies</Text>
            <Switch
              value={document.metadata.allowReplies}
              onValueChange={(v) => updateMetadata({ allowReplies: v })}
              trackColor={{ false: colors.surfaceAlt, true: `${colors.brand}40` }}
              thumbColor={document.metadata.allowReplies ? colors.brand : colors.textMuted}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Allow reactions</Text>
            <Switch
              value={document.metadata.allowReactions}
              onValueChange={(v) => updateMetadata({ allowReactions: v })}
              trackColor={{ false: colors.surfaceAlt, true: `${colors.brand}40` }}
              thumbColor={document.metadata.allowReactions ? colors.brand : colors.textMuted}
            />
          </View>
        </>
      )}

      {/* Scheduling — Instagram-style "Schedule for later" */}
      <Text style={styles.sectionLabel}>Schedule</Text>
      <View style={styles.scheduleRow}>
        <Pressable
          style={[styles.schedulePill, !document.metadata.scheduledFor && styles.schedulePillActive]}
          onPress={() => { haptic.selection(); updateMetadata({ scheduledFor: undefined }); }}
          accessibilityLabel="Publish now"
          accessibilityRole="button"
          hitSlop={12}
        >
          <Ionicons name="flash-outline" size={16} color={!document.metadata.scheduledFor ? colors.brand : colors.textSecondary} />
          <Text style={[styles.schedulePillText, !document.metadata.scheduledFor && { color: colors.brand }]}>Now</Text>
        </Pressable>
        <Pressable
          style={[styles.schedulePill, document.metadata.scheduledFor && styles.schedulePillActive]}
          onPress={() => {
            haptic.selection();
            // Default: tomorrow at 12:00 local
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(12, 0, 0, 0);
            updateMetadata({ scheduledFor: tomorrow.toISOString() });
          }}
          accessibilityLabel="Schedule for later"
          accessibilityRole="button"
          hitSlop={12}
        >
          <Ionicons name="time-outline" size={16} color={document.metadata.scheduledFor ? colors.brand : colors.textSecondary} />
          <Text style={[styles.schedulePillText, document.metadata.scheduledFor && { color: colors.brand }]}>Later</Text>
        </Pressable>
      </View>
      {document.metadata.scheduledFor && (
        <View style={styles.scheduleDateTime}>
          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.scheduleDateTimeText}>
            {new Date(document.metadata.scheduledFor).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            {' at '}
            {new Date(document.metadata.scheduledFor).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </Text>
          <Pressable
            onPress={() => { haptic.light(); updateMetadata({ scheduledFor: undefined }); }}
            hitSlop={12}
            accessibilityLabel="Clear schedule"
            accessibilityRole="button"
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={() => { haptic.selection(); onSaveDraft(); }}
          style={styles.draftBtn}
          accessibilityLabel="Save as draft"
          accessibilityRole="button"
          hitSlop={12}
        >
          <Ionicons name="save-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.draftBtnText}>Save draft</Text>
        </Pressable>
        <Pressable
          onPress={() => { haptic.medium(); onPublish(); }}
          style={styles.publishBtn}
          accessibilityLabel={document.metadata.scheduledFor ? 'Schedule post' : 'Publish now'}
          accessibilityRole="button"
          hitSlop={16}
        >
          <Text style={styles.publishBtnText}>{document.metadata.scheduledFor ? 'Schedule' : 'Publish now'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.subtitle.size,
      color: colors.textPrimary,
    },
    closeBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm,
    },
    scrollBody: {
      paddingHorizontal: Space.md,
    },
    scrollContent: {
      paddingBottom: Space.xl,
      gap: Space.sm,
    },
    previewContainer: {
      alignItems: 'center',
      paddingVertical: Space.sm,
      gap: Space.md,
    },
    previewScroll: {
      marginHorizontal: -Space.md,
    },
    previewPageWrapper: {
      marginHorizontal: Space.md,
    },
    sectionLabel: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.caption.size,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    textInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      fontSize: Type.body.size,
      color: colors.textPrimary,
      minHeight: 60,
    },
    captionCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      padding: Space.md,
    },
    captionInput: {
      fontSize: Type.body.size,
      color: colors.textPrimary,
      minHeight: 80,
      textAlignVertical: 'top',
      padding: 0,
    },
    captionCount: {
      alignSelf: 'flex-end',
      fontFamily: Typography.family.medium,
      fontSize: Type.meta.size,
      color: colors.textMuted,
      marginTop: Space.xs,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggleLabel: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
      color: colors.textPrimary,
    },
    toggleLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    cameraRollRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      padding: Space.md,
    },
    // ── Audience segmented control ──
    audienceRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: Space.sm,
    },
    audiencePill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceAlt,
    },
    audiencePillActive: {
      backgroundColor: colors.brand,
    },
    audiencePillText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
      color: colors.textSecondary,
    },
    audiencePillTextActive: {
      color: '#fff',
    },
    // ── Cover selection ──
    coverHint: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      color: colors.textMuted,
      marginBottom: Space.xs,
    },
    coverScroll: {
      marginHorizontal: -Space.md,
    },
    coverContainer: {
      paddingHorizontal: Space.md,
      gap: 10,
      paddingBottom: Space.xs,
    },
    coverThumbWrap: {
      borderRadius: Radius.lg,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: 'transparent',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    coverThumbActive: {
      borderColor: colors.brand,
    },
    coverBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scheduleRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    schedulePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    schedulePillActive: {
      borderColor: colors.brand,
    },
    schedulePillText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
      color: colors.textSecondary,
    },
    scheduleDateTime: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    scheduleDateTimeText: {
      flex: 1,
      fontFamily: Typography.family.regular,
      fontSize: Type.body.size,
      color: colors.textPrimary,
    },
    actionRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.md,
    },
    draftBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Space.md,
      height: 44,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    draftBtnText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
      color: colors.textSecondary,
    },
    publishBtn: {
      flex: 1,
      height: 44,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
    },
    publishBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    centerState: {
      alignItems: 'center',
      paddingVertical: Space.xl,
      gap: Space.sm,
    },
    centerStateTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.title.size,
      color: colors.textPrimary,
    },
    centerStateText: {
      fontFamily: Typography.family.regular,
      fontSize: Type.body.size,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    progressBarTrack: {
      width: '80%',
      height: 4,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
      marginTop: Space.xs,
    },
    progressBarFill: {
      height: 4,
      borderRadius: Radius.sm,
      backgroundColor: colors.brand,
    },
    retryBtn: {
      paddingHorizontal: Space.md + 4,
      height: 40,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.sm,
    },
    retryBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    successCircle: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      backgroundColor: colors.success,
      justifyContent: 'center',
      alignItems: 'center',
    },
    successContainer: {
      width: 72,
      height: 72,
      justifyContent: 'center',
      alignItems: 'center',
    },
    successTitle: {
      fontFamily: Typography.family.bold,
      fontSize: Type.subtitle.size,
      color: colors.textPrimary,
    },
    viewBtn: {
      width: '80%',
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.sm,
    },
    viewBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      width: '80%',
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.brand,
    },
    shareBtnText: {
      color: colors.brand,
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },
  });
}
