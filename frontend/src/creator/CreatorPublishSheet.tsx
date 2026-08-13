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
  LayoutAnimation,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  useReducedMotion,
  Easing,
  runOnJS,
  useAnimatedReaction,
  interpolate,
  useAnimatedProps,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
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

// ── Upload step definitions ────────────────────────────────────────
type UploadStepId = 'preparing' | 'uploading' | 'processing' | 'publishing' | 'done';

interface UploadStep {
  id: UploadStepId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  range: [number, number]; // fraction range [start, end)
}

const UPLOAD_STEPS: UploadStep[] = [
  { id: 'preparing', label: 'Preparing media...', icon: 'images-outline', range: [0, 0.3] },
  { id: 'uploading', label: 'Uploading...', icon: 'cloud-upload-outline', range: [0.3, 0.7] },
  { id: 'processing', label: 'Processing...', icon: 'cog-outline', range: [0.7, 0.9] },
  { id: 'publishing', label: 'Publishing...', icon: 'rocket-outline', range: [0.9, 1.0] },
  { id: 'done', label: 'Done', icon: 'checkmark-circle-outline', range: [1.0, 1.0] },
];

function stepForFraction(fraction: number): UploadStep {
  for (const step of UPLOAD_STEPS) {
    if (fraction >= step.range[0] && fraction < step.range[1]) return step;
  }
  return UPLOAD_STEPS[UPLOAD_STEPS.length - 1];
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
  const [currentStepId, setCurrentStepId] = useState<UploadStepId>('preparing');
  const publishGuardRef = useRef(new PublishGuard());
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Smooth progress bar (UI-thread animated) ────────────────────
  const progressWidth = useSharedValue(0);
  const progressPercentSV = useSharedValue(0);
  const lastStepRef = useRef<UploadStepId>('preparing');

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progressWidth.value * 100)}%`,
  }));

  // Animated percentage text — Reanimated text props for UI-thread updates
  const percentAnimatedProps = useAnimatedProps(() => ({
    text: `${Math.round(progressPercentSV.value)}%`,
  }));

  // Haptic tick on step change
  useAnimatedReaction(
    () => progressWidth.value,
    (val) => {
      const step = stepForFraction(val);
      if (step.id !== lastStepRef.current) {
        lastStepRef.current = step.id;
        runOnJS(handleStepChange)(step.id);
      }
    },
    [progressWidth],
  );

  const handleStepChange = useCallback((stepId: UploadStepId) => {
    setCurrentStepId(stepId);
    haptic.light();
  }, [haptic]);

  // Haptic feedback when entering the success state
  useEffect(() => {
    if (stage === 'success') {
      haptic.success();
    } else if (stage === 'error') {
      haptic.error();
    }
  }, [stage, haptic]);

  // Light haptic when sheet opens
  useEffect(() => {
    if (visible) {
      haptic.light();
    }
  }, [visible, haptic]);

  const handleClose = useCallback(() => {
    if (stage === 'publishing' || stage === 'uploading') return;
    haptic.selection();
    setStage('review');
    setErrorMessage('');
    setUploadProgress('');
    setUploadFraction(0);
    setUploadCompleted(0);
    setUploadTotal(0);
    setCurrentStepId('preparing');
    lastStepRef.current = 'preparing';
    progressWidth.value = 0;
    progressPercentSV.value = 0;
    publishGuardRef.current.reset();
    onClose();
  }, [stage, haptic, onClose, progressWidth, progressPercentSV]);

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
        setCurrentStepId('preparing');
        lastStepRef.current = 'preparing';
        // Animate to "preparing" range
        const prepFraction = 0.15;
        progressWidth.value = reduceMotion ? prepFraction : withSpring(prepFraction, spring.entrance);
        progressPercentSV.value = reduceMotion ? prepFraction * 100 : withSpring(prepFraction * 100, spring.entrance);

        workingDoc = await uploadAllLocalMedia(document, (progress) => {
          if (progress.total > 0) {
            const fraction = (progress.completed + 1) / progress.total;
            // Map upload fraction into the 0.3–0.7 range
            const mappedFraction = 0.3 + fraction * 0.4;
            setUploadProgress(`Uploading media ${progress.completed + 1} of ${progress.total}`);
            setUploadTotal(progress.total);
            setUploadCompleted(progress.completed + 1);
            setUploadFraction(fraction);
            progressWidth.value = reduceMotion ? mappedFraction : withSpring(mappedFraction, spring.entrance);
            progressPercentSV.value = reduceMotion ? mappedFraction * 100 : withSpring(mappedFraction * 100, spring.entrance);
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
      setCurrentStepId('processing');
      lastStepRef.current = 'processing';
      // Animate to "processing" range
      const processingFraction = 0.8;
      progressWidth.value = reduceMotion ? processingFraction : withSpring(processingFraction, spring.entrance);
      progressPercentSV.value = reduceMotion ? processingFraction * 100 : withSpring(processingFraction * 100, spring.entrance);

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
        // Animate progress to 100%
        progressWidth.value = reduceMotion ? 1 : withSpring(1, spring.success);
        progressPercentSV.value = reduceMotion ? 100 : withSpring(100, spring.success);
        setCurrentStepId('done');
        lastStepRef.current = 'done';
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
        // Animate progress to 100%
        progressWidth.value = reduceMotion ? 1 : withSpring(1, spring.success);
        progressPercentSV.value = reduceMotion ? 100 : withSpring(100, spring.success);
        setCurrentStepId('done');
        lastStepRef.current = 'done';
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
  }, [document, editingLookId, reduceMotion, spring.entrance, spring.success]);

  const handleRetry = useCallback(() => {
    haptic.medium();
    setStage('review');
    setErrorMessage('');
    setUploadProgress('');
    setUploadFraction(0);
    setUploadCompleted(0);
    setUploadTotal(0);
    setCurrentStepId('preparing');
    lastStepRef.current = 'preparing';
    progressWidth.value = 0;
    progressPercentSV.value = 0;
    publishGuardRef.current.reset();
    // Re-trigger publish
    setTimeout(() => handlePublish(), 50);
  }, [haptic, progressWidth, progressPercentSV, handlePublish]);

  if (!visible && stage === 'review') return null;

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.85}>
        <View style={styles.header}>
          <Text style={styles.title}>Publish</Text>
          <PressScale onPress={handleClose} style={styles.closeBtn} accessibilityLabel="Close publish" accessibilityHint="Closes the publish sheet" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>

        {stage === 'review' && (
          <PublishReview document={document} onPublish={handlePublish} onSaveDraft={saveDraft} />
        )}

        {stage === 'uploading' && (
          <UploadProgressView
            colors={colors}
            styles={styles}
            reduceMotion={reduceMotion}
            springCfg={spring.entrance}
            uploadTotal={uploadTotal}
            uploadCompleted={uploadCompleted}
            uploadProgress={uploadProgress}
            currentStepId={currentStepId}
            progressAnimatedStyle={progressAnimatedStyle}
            percentAnimatedProps={percentAnimatedProps}
            progressWidth={progressWidth}
          />
        )}

        {stage === 'publishing' && (
          <UploadProgressView
            colors={colors}
            styles={styles}
            reduceMotion={reduceMotion}
            springCfg={spring.entrance}
            uploadTotal={0}
            uploadCompleted={0}
            uploadProgress="Publishing..."
            currentStepId={currentStepId}
            progressAnimatedStyle={progressAnimatedStyle}
            percentAnimatedProps={percentAnimatedProps}
            progressWidth={progressWidth}
          />
        )}

        {stage === 'success' && (
          <CelebrationSuccess
            colors={colors}
            reduceMotion={reduceMotion}
            springCfg={spring.success}
            springEntrance={spring.entrance}
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
            onCreateNew={() => {
              haptic.selection();
              onClose();
              setStage('review');
              navigation.navigate('CreatorStudio', { type: document.type });
            }}
            onShare={() => { haptic.selection(); }}
          />
        )}

        {stage === 'error' && (
          <ErrorStateView
            colors={colors}
            styles={styles}
            reduceMotion={reduceMotion}
            springCfg={spring.entrance}
            errorMessage={errorMessage}
            onRetry={handleRetry}
            haptic={haptic}
          />
        )}
    </SheetContainer>
  );
}

// ── Upload Progress View with step indicators ──────────────────────
interface UploadProgressViewProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  uploadTotal: number;
  uploadCompleted: number;
  uploadProgress: string;
  currentStepId: UploadStepId;
  progressAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  percentAnimatedProps: ReturnType<typeof useAnimatedProps>;
  progressWidth: ReturnType<typeof useSharedValue<number>>;
}

function UploadProgressView({
  colors,
  styles,
  reduceMotion,
  springCfg,
  uploadTotal,
  uploadCompleted,
  uploadProgress,
  currentStepId,
  progressAnimatedStyle,
  percentAnimatedProps,
}: UploadProgressViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={localStyles.centerState}>
      {/* Step indicators */}
      <View style={localStyles.stepRow}>
        {UPLOAD_STEPS.slice(0, 4).map((step) => {
          const isActive = currentStepId === step.id;
          const isDone = UPLOAD_STEPS.indexOf(UPLOAD_STEPS.find((s) => s.id === currentStepId)!) > UPLOAD_STEPS.indexOf(step);
          return (
            <View key={step.id} style={localStyles.stepItem}>
              <View style={[
                localStyles.stepIconWrap,
                isActive && localStyles.stepIconWrapActive,
                isDone && localStyles.stepIconWrapDone,
              ]}>
                <Ionicons
                  name={isDone ? 'checkmark' : step.icon}
                  size={16}
                  color={isActive || isDone ? colors.textInverse : colors.textMuted}
                />
              </View>
              <Text
                style={[
                  localStyles.stepLabel,
                  isActive && localStyles.stepLabelActive,
                ]}
                numberOfLines={1}
              >
                {step.label.replace('...', '')}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Current step label */}
      <Text style={localStyles.centerStateText}>
        {uploadTotal > 0
          ? `Uploading ${uploadCompleted} of ${uploadTotal}...`
          : uploadProgress || 'Uploading media...'}
      </Text>

      {/* Gradient progress bar */}
      <View style={localStyles.progressBarTrack}>
        <Reanimated.View style={[localStyles.progressBarFillContainer, progressAnimatedStyle]}>
          <LinearGradient
            colors={[colors.brand, colors.antiqueGold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={localStyles.progressBarGradient}
          />
        </Reanimated.View>
        {/* Percentage overlay */}
        <View style={localStyles.percentOverlay} pointerEvents="none">
          <Reanimated.Text style={localStyles.percentText} animatedProps={percentAnimatedProps} />
        </View>
      </View>

      <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: Space.sm }} />
    </View>
  );
}

// ── Error State View with spring entrance and retry ────────────────
interface ErrorStateViewProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  errorMessage: string;
  onRetry: () => void;
  haptic: ReturnType<typeof useHaptic>;
}

function ErrorStateView({
  colors,
  reduceMotion,
  springCfg,
  errorMessage,
  onRetry,
}: ErrorStateViewProps) {
  const localStyles = useMemo(() => createStyles(colors), [colors]);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      opacity.value = 1;
    } else {
      scale.value = withSpring(1, { ...springCfg, damping: 16 });
      opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
    }
  }, [reduceMotion, springCfg, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Reanimated.View style={[localStyles.centerState, animatedStyle]}>
      <View style={localStyles.errorCircle}>
        <Ionicons name="warning" size={36} color={colors.danger} />
      </View>
      <Text style={localStyles.centerStateTitle}>Publishing failed</Text>
      <Text style={localStyles.centerStateText}>{errorMessage}</Text>
      <PressScale
        onPress={onRetry}
        style={localStyles.retryBtn}
        accessibilityLabel="Retry publish"
        accessibilityHint="Retries the failed publish attempt"
        scale={0.95}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="refresh-outline" size={16} color={colors.textInverse} style={{ marginRight: 6 }} />
        <Text style={localStyles.retryBtnText}>Retry</Text>
      </PressScale>
    </Reanimated.View>
  );
}

interface CelebrationSuccessProps {
  colors: ThemeColors;
  reduceMotion: boolean;
  springCfg: { damping: number; stiffness: number; mass: number };
  springEntrance: { damping: number; stiffness: number; mass: number };
  publishedId: string;
  documentType: 'look' | 'poster';
  onView: () => void;
  onCreateNew: () => void;
  onShare: () => void;
}

const CONFETTI_COLORS = ['#F4F0E8', '#C9A46A', '#B85566', '#4A7AC4', '#215634', '#9A6B7A', '#8A6A3F'];
const CONFETTI_COUNT = 36;

function CelebrationSuccess({
  colors,
  reduceMotion,
  springCfg,
  springEntrance,
  onView,
  onCreateNew,
  onShare,
}: CelebrationSuccessProps) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const checkScale = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(8);
  const titleScale = useSharedValue(0.5);
  const subtitleOpacity = useSharedValue(0);
  const btnOpacity = useSharedValue(0);
  const btnTranslateY = useSharedValue(20);
  const fadeOut = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      checkScale.value = 1;
      titleOpacity.value = 1;
      titleTranslateY.value = 0;
      titleScale.value = 1;
      subtitleOpacity.value = 1;
      btnOpacity.value = 1;
      btnTranslateY.value = 0;
    } else {
      // Check circle spring with bouncy overshoot
      checkScale.value = withSpring(1.2, { ...springCfg, damping: 10 }, () => {
        checkScale.value = withSpring(1.0, springCfg);
      });
      // "Published!" text — spring scale 0.5→1.0 with bouncy damping
      titleOpacity.value = withDelay(200, withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }));
      titleTranslateY.value = withDelay(200, withSpring(0, { ...springEntrance, damping: 14 }));
      titleScale.value = withDelay(200, withSpring(1.0, { ...springCfg, damping: 10 }));
      // Subtitle
      subtitleOpacity.value = withDelay(400, withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) }));
      // Buttons — spring entrance
      btnOpacity.value = withDelay(600, withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) }));
      btnTranslateY.value = withDelay(600, withSpring(0, springEntrance));
    }
  }, [reduceMotion, springCfg, springEntrance, checkScale, titleOpacity, titleTranslateY, titleScale, subtitleOpacity, btnOpacity, btnTranslateY]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }, { scale: titleScale.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const btnStyle = useAnimatedStyle(() => ({
    opacity: btnOpacity.value,
    transform: [{ translateY: btnTranslateY.value }],
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: fadeOut.value,
  }));

  return (
    <Reanimated.View style={[styles.centerState, containerStyle]}>
      <View style={styles.successContainer}>
        <Reanimated.View style={[styles.successCircle, checkStyle]}>
          <Ionicons name="checkmark" size={32} color={colors.textInverse} />
        </Reanimated.View>
        {!reduceMotion && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
              <ConfettiParticle key={i} index={i} />
            ))}
          </View>
        )}
      </View>
      <Reanimated.View style={titleStyle}>
        <Text style={styles.successTitle}>Published!</Text>
      </Reanimated.View>
      <Reanimated.View style={subtitleStyle}>
        <Text style={styles.centerStateText}>Your content is now live</Text>
      </Reanimated.View>
      <Reanimated.View style={[styles.successBtnGroup, btnStyle]}>
        <PressScale
          onPress={onView}
          style={styles.viewBtn}
          accessibilityLabel="View published content"
          accessibilityHint="Opens the published look or poster"
          scale={0.95}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.viewBtnText}>View Post</Text>
        </PressScale>
        <PressScale
          onPress={onCreateNew}
          style={styles.createBtn}
          accessibilityLabel="Create new post"
          accessibilityHint="Starts a new creation in the studio"
          scale={0.95}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
          <Text style={styles.createBtnText}>Create New</Text>
        </PressScale>
        <PressScale
          onPress={onShare}
          style={styles.shareBtn}
          accessibilityLabel="Share published content"
          accessibilityHint="Shares the published content"
          scale={0.96}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="share-outline" size={18} color={colors.brand} />
          <Text style={styles.shareBtnText}>Share</Text>
        </PressScale>
      </Reanimated.View>
    </Reanimated.View>
  );
}

function ConfettiParticle({ index }: { index: number }) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);
  const rotate = useSharedValue(0);

  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const angle = (index / CONFETTI_COUNT) * Math.PI * 2;
  const distance = 60 + (index % 4) * 25;
  const targetX = Math.cos(angle) * distance;
  const targetY = Math.sin(angle) * distance - 30;
  const size = 5 + (index % 4) * 2;

  useEffect(() => {
    // Spring spawn (scale 0→1 with bouncy damping 0.65 → damping ~12)
    opacity.value = withDelay(80 + index * 20, withTiming(1, { duration: 100 }));
    scale.value = withDelay(80 + index * 20, withSpring(1, { damping: 12, stiffness: 160, mass: 0.8 }));
    translateX.value = withDelay(80 + index * 20, withSpring(targetX, { damping: 14, stiffness: 120, mass: 0.9 }));
    // Gravity + fade — particles fall and fade
    translateY.value = withDelay(80 + index * 20, withSpring(targetY + 120, { damping: 10, stiffness: 80, mass: 1.2 }));
    rotate.value = withDelay(80 + index * 20, withSpring((index % 2 ? 1 : -1) * 360, { damping: 14, stiffness: 100, mass: 1.0 }));
    opacity.value = withDelay(1000 + index * 20, withTiming(0, { duration: 500 }));
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
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const canvasWidth = 280;
  const canvasHeight = Math.floor(canvasWidth / document.canvas.aspectRatio);
  const coverThumbWidth = 100;
  const coverThumbHeight = 125;
  const [saveToCameraRoll, setSaveToCameraRoll] = useState(true);
  const [coverPageIndex, setCoverPageIndex] = useState(0);
  const [captionError, setCaptionError] = useState('');
  const [captionBlurred, setCaptionBlurred] = useState(false);

  // ── Audience selector segmented control ─────────────────────────
  const audienceOptions = [
    { key: 'public' as const, label: 'Public', icon: 'globe-outline' as const },
    { key: 'closeFriends' as const, label: 'Followers', icon: 'people-outline' as const },
    { key: 'private' as const, label: 'Close Friends', icon: 'star-outline' as const },
  ];
  const activeAudienceIndex = audienceOptions.findIndex((o) => o.key === document.metadata.visibility);

  // Segmented control spring slide indicator
  const segmentTranslateX = useSharedValue(activeAudienceIndex * 0);
  const segmentWidth = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      segmentTranslateX.value = activeAudienceIndex;
    } else {
      segmentTranslateX.value = withSpring(activeAudienceIndex, { ...spring.entrance, damping: 18 });
    }
  }, [activeAudienceIndex, reduceMotion, spring.entrance, segmentTranslateX]);

  const segmentIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: segmentTranslateX.value * segmentWidth.value }],
  }));

  // ── Caption validation ──────────────────────────────────────────
  const validateCaption = useCallback(() => {
    // Caption is optional for looks but recommended; for posters with no media,
    // a caption helps. We show a soft warning, not a hard block.
    if (captionBlurred && document.metadata.caption.trim().length === 0 && document.type === 'poster') {
      setCaptionError('Add a caption to help your audience discover this poster');
      haptic.warning();
      return false;
    }
    setCaptionError('');
    return true;
  }, [captionBlurred, document.metadata.caption, document.type, haptic]);

  // Caption error spring appearance
  const errorOpacity = useSharedValue(0);
  const errorTranslateY = useSharedValue(-8);

  useEffect(() => {
    if (captionError) {
      if (reduceMotion) {
        errorOpacity.value = 1;
        errorTranslateY.value = 0;
      } else {
        errorOpacity.value = withSpring(1, { ...spring.entrance, damping: 18 });
        errorTranslateY.value = withSpring(0, { ...spring.entrance, damping: 18 });
      }
    } else {
      errorOpacity.value = reduceMotion ? 0 : withTiming(0, { duration: 150 });
      errorTranslateY.value = reduceMotion ? -8 : withTiming(-8, { duration: 150 });
    }
  }, [captionError, reduceMotion, spring.entrance, errorOpacity, errorTranslateY]);

  const errorStyle = useAnimatedStyle(() => ({
    opacity: errorOpacity.value,
    transform: [{ translateY: errorTranslateY.value }],
  }));

  const handleCaptionBlur = useCallback(() => {
    setCaptionBlurred(true);
    // Validate after state update
    setTimeout(() => {
      if (document.metadata.caption.trim().length === 0 && document.type === 'poster') {
        setCaptionError('Add a caption to help your audience discover this poster');
        haptic.warning();
      } else {
        setCaptionError('');
      }
    }, 0);
  }, [document.metadata.caption, document.type, haptic]);

  const handlePublishWithValidation = useCallback(() => {
    if (document.type === 'poster' && document.metadata.caption.trim().length === 0) {
      setCaptionBlurred(true);
      setCaptionError('Add a caption to help your audience discover this poster');
      haptic.warning();
      return;
    }
    setCaptionError('');
    onPublish();
  }, [document.type, document.metadata.caption, onPublish, haptic]);

  // ── Save as draft with navigation ───────────────────────────────
  const handleSaveDraft = useCallback(async () => {
    haptic.light();
    await onSaveDraft();
  }, [haptic, onSaveDraft]);

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
                accessibilityHint="Sets this page as the story cover"
                accessibilityRole="button"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
                    <Ionicons name="checkmark" size={12} color={colors.textInverse} />
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* Caption with inline validation */}
      <Text style={styles.sectionLabel}>Caption</Text>
      <View style={[styles.captionCard, captionError && styles.captionCardError]}>
        <TextInput
          style={styles.captionInput}
          placeholder="Write a caption..."
          placeholderTextColor={colors.textMuted}
          value={document.metadata.caption}
          onChangeText={(v) => {
            updateMetadata({ caption: v });
            if (captionError && v.trim().length > 0) {
              setCaptionError('');
            }
          }}
          onBlur={handleCaptionBlur}
          multiline
          maxLength={500}
          accessibilityLabel="Caption"
        />
        <Text style={styles.captionCount}>{document.metadata.caption.length}/500</Text>
      </View>
      {/* Inline error message with spring appearance */}
      {captionError !== '' && (
        <Reanimated.View style={[styles.captionErrorWrap, errorStyle]}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={styles.captionErrorText}>{captionError}</Text>
        </Reanimated.View>
      )}

      {/* Audience selector — segmented control with spring slide indicator */}
      <Text style={styles.sectionLabel}>Audience</Text>
      <View
        style={styles.audienceSegmented}
        onLayout={(e) => { segmentWidth.value = e.nativeEvent.layout.width / audienceOptions.length; }}
      >
        {/* Spring slide indicator */}
        <Reanimated.View
          style={[styles.audienceSegmentIndicator, segmentIndicatorStyle]}
          pointerEvents="none"
        />
        {audienceOptions.map((opt) => {
          const isActive = document.metadata.visibility === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => { haptic.light(); updateMetadata({ visibility: opt.key }); }}
              style={styles.audienceSegmentItem}
              accessibilityLabel={`Audience ${opt.label}`}
              accessibilityHint={`Sets visibility to ${opt.label}`}
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name={opt.icon} size={16} color={isActive ? colors.textInverse : colors.textSecondary} />
              <Text style={[styles.audienceSegmentText, isActive && styles.audienceSegmentTextActive]}>{opt.label}</Text>
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
          thumbColor={saveToCameraRoll ? colors.textInverse : colors.textMuted}
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
              onValueChange={(v) => { haptic.selection(); updateMetadata({ allowReplies: v }); }}
              trackColor={{ false: colors.surfaceAlt, true: `${colors.brand}40` }}
              thumbColor={document.metadata.allowReplies ? colors.brand : colors.textMuted}
              accessibilityLabel="Allow replies"
              accessibilityHint="Toggles whether viewers can reply to this poster"
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Allow reactions</Text>
            <Switch
              value={document.metadata.allowReactions}
              onValueChange={(v) => { haptic.selection(); updateMetadata({ allowReactions: v }); }}
              trackColor={{ false: colors.surfaceAlt, true: `${colors.brand}40` }}
              thumbColor={document.metadata.allowReactions ? colors.brand : colors.textMuted}
              accessibilityLabel="Allow reactions"
              accessibilityHint="Toggles whether viewers can react to this poster"
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
          accessibilityHint="Publishes immediately"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
          accessibilityHint="Schedules the post for tomorrow at noon"
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Clear schedule"
            accessibilityHint="Removes the scheduled date and switches to publish now"
            accessibilityRole="button"
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      {/* Actions — Save as Draft + Publish */}
      <View style={styles.actionRow}>
        <PressScale
          onPress={handleSaveDraft}
          style={styles.draftBtn}
          accessibilityLabel="Save as draft"
          accessibilityHint="Saves the current creation as a draft"
          scale={0.96}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="save-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.draftBtnText}>Save draft</Text>
        </PressScale>
        <PressScale
          onPress={handlePublishWithValidation}
          style={styles.publishBtn}
          accessibilityLabel={document.metadata.scheduledFor ? 'Schedule post' : 'Publish now'}
          accessibilityHint={document.metadata.scheduledFor ? 'Schedules the post for the selected date' : 'Publishes the content immediately'}
          scale={0.96}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.publishBtnText}>{document.metadata.scheduledFor ? 'Schedule' : 'Publish now'}</Text>
        </PressScale>
      </View>
    </ScrollView>
  );
}

type ThemeColorsType = ReturnType<typeof useAppTheme>['colors'];

function createStyles(colors: ThemeColorsType) {
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
      borderWidth: 1,
      borderColor: 'transparent',
    },
    captionCardError: {
      borderColor: colors.danger,
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
    captionErrorWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.xs,
    },
    captionErrorText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.caption.size,
      color: colors.danger,
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
    audienceSegmented: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      padding: 4,
      marginBottom: Space.sm,
      position: 'relative',
    },
    audienceSegmentIndicator: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      width: '33.33%',
      backgroundColor: colors.brand,
      borderRadius: Radius.md,
    },
    audienceSegmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: Space.sm,
      zIndex: 1,
    },
    audienceSegmentText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.caption.size,
      color: colors.textSecondary,
    },
    audienceSegmentTextActive: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
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
      shadowColor: colors.shadow,
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
    // ── Upload progress with steps ──
    stepRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '90%',
      marginBottom: Space.sm,
    },
    stepItem: {
      alignItems: 'center',
      flex: 1,
      gap: 4,
    },
    stepIconWrap: {
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    stepIconWrapActive: {
      backgroundColor: colors.brand,
    },
    stepIconWrapDone: {
      backgroundColor: colors.success,
    },
    stepLabel: {
      fontFamily: Typography.family.regular,
      fontSize: Type.meta.size,
      color: colors.textMuted,
      textAlign: 'center',
    },
    stepLabelActive: {
      color: colors.textPrimary,
      fontFamily: Typography.family.medium,
    },
    // ── Progress bar ──
    progressBarTrack: {
      width: '80%',
      height: 24,
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
      marginTop: Space.xs,
      justifyContent: 'center',
      position: 'relative',
    },
    progressBarFillContainer: {
      height: '100%',
      borderRadius: Radius.lg,
      overflow: 'hidden',
    },
    progressBarGradient: {
      flex: 1,
    },
    percentOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    percentText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.meta.size,
      color: colors.textInverse,
    },
    // ── Error state ──
    errorCircle: {
      width: 72,
      height: 72,
      borderRadius: Radius.full,
      backgroundColor: colors.danger + '20',
      justifyContent: 'center',
      alignItems: 'center',
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md + 4,
      height: 40,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      marginTop: Space.sm,
    },
    retryBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    // ── Success state ──
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
    successBtnGroup: {
      width: '80%',
      gap: Space.sm,
      marginTop: Space.sm,
    },
    viewBtn: {
      width: '100%',
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand,
      justifyContent: 'center',
      alignItems: 'center',
    },
    viewBtnText: {
      color: colors.textInverse,
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      width: '100%',
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.brand,
    },
    createBtnText: {
      color: colors.brand,
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },
    shareBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      width: '100%',
      paddingVertical: Space.sm,
      borderRadius: Radius.lg,
    },
    shareBtnText: {
      color: colors.brand,
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },
  });
}
