import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  useWindowDimensions,
  AppState,
  Image,
  ActivityIndicator,
  AccessibilityInfo,
  BackHandler } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import {
  fetchPosterStories,
  fetchPosterStoryById,
  recordPosterFrameView,
  setPosterFrameReaction,
  removePosterFrameReaction,
  createPosterReply,
  deletePosterStory,
  archivePosterStory,
  fetchPosterTags,
  recordPosterTagClick,
  votePosterPoll,
  votePosterQuiz,
  answerPosterQuestion,
  votePosterStyle } from '../services/postersApi';
import type {
  PosterStory,
  PosterFrame,
  PosterReactionType,
  PosterTag,
  PosterSticker as ApiPosterSticker,
  PollVoteResult,
  QuizVoteResult } from '../services/postersApi';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { usePosterViewerGesture } from '../hooks/usePosterViewerGesture';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useConnectivity } from '../hooks/useConnectivity';
import { Typography, Space, Radius, Control, LetterSpacing, Elevation } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { Motion } from '../theme/motionTokens';
import { isVideoUrl, shadeColor } from '../utils/posterPhysics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { OfflineBanner } from '../components/OfflineBanner';
import { PosterViewerSkeleton } from '../components/skeletons/PosterViewerSkeleton';
import { PosterProgressSegments } from '../components/poster/PosterProgressSegments';
import { PosterStickerLayer } from '../components/poster/PosterStickerLayer';
import { MoodboardPosterFrame } from '../components/poster/MoodboardPosterFrame';
import { PosterReactionReplyBar } from '../components/poster/PosterReactionReplyBar';
import { HeartBurst } from '../components/poster/HeartBurst';
import { StickerInteractionPanel } from '../components/poster/StickerInteractionPanel';
import { ShareSheet } from '../components/ShareSheet';
import { CachedImage } from '../components/CachedImage';
import { VerificationBadge } from '../components/profile/VerificationBadge';
import { Video } from '../components/compat/Video';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring } from 'react-native-reanimated';
import { safeValidateDocument, type CreatorDocument } from '../creator/composition';
import { CreatorCanvas } from '../creator/CreatorCanvas';
import * as Clipboard from 'expo-clipboard';
import { Sentry } from '../platform/monitoring';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { ApiRequestError } from '../lib/apiClient';

const TICK_MS = 50;

type NavT = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'PosterViewer'>;

export default function PosterViewerScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const toggleSavedPosterStory = useStore((state) => state.toggleSavedPosterStory);
  const isSavedPosterStory = useStore((state) => state.isSavedPosterStory);
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { isOffline } = useConnectivity();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, SCREEN_WIDTH, SCREEN_HEIGHT), [colors, SCREEN_WIDTH, SCREEN_HEIGHT]);

  const [stories, setStories] = React.useState<PosterStory[]>([]);
  const [storyIndex, setStoryIndex] = React.useState(0);
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<{ kind: 'connection' | 'offline' | 'missing' } | null>(null);
  const [mediaError, setMediaError] = React.useState(false);
  const [recordedFrames, setRecordedFrames] = React.useState<Set<string>>(new Set());
  const [posterTags, setPosterTags] = React.useState<PosterTag[]>([]);
  const [shareVisible, setShareVisible] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(true);
  const [mediaRetryKey, setMediaRetryKey] = React.useState(0);
  const [isBuffering, setIsBuffering] = React.useState(false);
  // Caption expand/collapse — 3-line clamp with "more" tap.
  const [captionExpanded, setCaptionExpanded] = React.useState(false);

  // ── Sticker interaction state ────────────────────────────────────────
  // Tracks the currently active interactive sticker (poll, quiz, question,
  // style_vote) and cached vote/answer results so the user sees feedback
  // after interacting. Follows Instagram's tap-sticker-to-interact pattern.
  const [activeInteractionSticker, setActiveInteractionSticker] = React.useState<ApiPosterSticker | null>(null);
  // Ref mirror of activeInteractionSticker.id so vote/answer closures always
  // read the current value instead of a stale render-time capture.
  const activeStickerIdRef = React.useRef<string | null>(null);
  const [pollResult, setPollResult] = React.useState<PollVoteResult | null>(null);
  const [quizResult, setQuizResult] = React.useState<QuizVoteResult | null>(null);
  const [questionAnswer, setQuestionAnswer] = React.useState('');
  const [questionAnswerSent, setQuestionAnswerSent] = React.useState(false);
  const [isStickerSubmitting, setIsStickerSubmitting] = React.useState(false);
  const [confirmSheet, setConfirmSheet] = React.useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const storyId = route.params?.storyId;
  const startFrameIndex = route.params?.startFrameIndex ?? 0;

  // Android hardware back button — dismiss the viewer (matches close button
  // and swipe-down dismiss). Without this, the hardware back does nothing
  // inside the GestureHandlerRootView-wrapped story viewer.
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      haptic.light();
      navigation.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [navigation, haptic]);

  React.useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setLoadError(null);

    const loadStories = async () => {
      try {
        if (storyId) {
          const story = await fetchPosterStoryById(storyId);
          if (!mounted) return;
          setStories([story]);
          setStoryIndex(0);
          setFrameIndex(Math.min(startFrameIndex, story.frames.length - 1));
        } else {
          const res = await fetchPosterStories({ active: true, limit: 50 });
          if (!mounted) return;
          setStories(res.items);
          setStoryIndex(0);
          setFrameIndex(0);
        }
      } catch (err: unknown) {
        if (!mounted) return;
        if (err instanceof ApiRequestError && (err.status === 404 || err.status === 410)) {
          setLoadError({ kind: 'missing' });
        } else if (isOffline) {
          setLoadError({ kind: 'offline' });
        } else {
          setLoadError({ kind: 'connection' });
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadStories();
    return () => { mounted = false; };
  }, [storyId, startFrameIndex, isOffline]);

  // Clear recorded-frames set when the storyId changes so view counts are
  // re-recorded for a freshly opened story (prevents stale-set memory leak).
  React.useEffect(() => {
    setRecordedFrames(new Set());
  }, [storyId]);

  const activeStory = stories[storyIndex];
  const activeFrame: PosterFrame | undefined = activeStory?.frames[frameIndex];
  const isOwner = !!activeStory && !!currentUser && activeStory.creatorId === currentUser.id;

  // Reset caption expansion whenever the frame changes so each frame starts
  // in its collapsed (3-line clamp) state.
  React.useEffect(() => {
    setCaptionExpanded(false);
  }, [activeFrame?.id]);

  // Parse the canonical composition document for WYSIWYG rendering. When
  // present, each page maps to a story frame and is rendered through the
  // same CreatorCanvas used in the editor, preserving all layers, geometry,
  // styles, and background.
  const compositionDoc = React.useMemo<CreatorDocument | null>(() => {
    if (!activeStory?.compositionDocument) return null;
    const result = safeValidateDocument(activeStory.compositionDocument);
    if (result.success && result.data && result.data.type === 'poster') {
      return result.data;
    }
    return null;
  }, [activeStory?.compositionDocument]);

  const compositionPage = compositionDoc?.pages[frameIndex] ?? null;

  const goNextFrame = React.useCallback(() => {
    setProgress(0);
    if (!activeStory) return;
    if (frameIndex < activeStory.frames.length - 1) {
      haptic.selection();
      setFrameIndex(frameIndex + 1);
      AccessibilityInfo.announceForAccessibility(
        `Frame ${frameIndex + 2} of ${activeStory.frames.length}`
      );
    } else if (storyIndex < stories.length - 1) {
      haptic.selection();
      const nextStory = stories[storyIndex + 1];
      const nextCreator = nextStory?.creator?.username ?? nextStory?.creatorId ?? '';
      setStoryIndex(storyIndex + 1);
      setFrameIndex(0);
      AccessibilityInfo.announceForAccessibility(
        `Now viewing ${nextCreator}'s poster. Frame 1 of ${nextStory?.frames.length ?? 1}`
      );
    }
    // At the last frame of the last story, do NOT auto-exit.
    // User must manually swipe down or tap X.
    // The progress timer simply stops advancing.
  }, [activeStory, frameIndex, storyIndex, stories.length, stories, haptic]);

  const goPrevFrame = React.useCallback(() => {
    setProgress(0);
    if (frameIndex > 0) {
      haptic.selection();
      setFrameIndex(frameIndex - 1);
      AccessibilityInfo.announceForAccessibility(
        `Frame ${frameIndex} of ${activeStory?.frames.length ?? 1}`
      );
    } else if (storyIndex > 0) {
      haptic.selection();
      const prevStory = stories[storyIndex - 1];
      const prevCreator = prevStory?.creator?.username ?? prevStory?.creatorId ?? '';
      const prevFrameCount = prevStory?.frames.length ?? 1;
      setStoryIndex(storyIndex - 1);
      setFrameIndex(Math.max(0, prevFrameCount - 1));
      AccessibilityInfo.announceForAccessibility(
        `Now viewing ${prevCreator}'s poster. Frame ${prevFrameCount} of ${prevFrameCount}`
      );
    }
  }, [frameIndex, storyIndex, stories, activeStory, haptic]);

  // ── Story transition — flat scale/fade (flagship restraint) ─────────
  // Per audit: the 3D cube rotation reads as a "demo effect" rather than
  // flagship restraint. Replaced with a flatter spatial transition:
  // horizontal edge continuity + small scale/fade only, keeping the
  // progress bar and header stable. Reduced-motion = no transform.
  const storyScale = useSharedValue(1);
  const storyOpacity = useSharedValue(1);
  const prevStoryIndexRef = React.useRef(storyIndex);

  React.useEffect(() => {
    if (prevStoryIndexRef.current === storyIndex) return;
    prevStoryIndexRef.current = storyIndex;
    if (reducedMotion) {
      storyScale.value = 1;
      storyOpacity.value = 1;
      return;
    }
    // Subtle scale dip (0.94→1) + brief opacity fade (0.5→1) for a
    // clean crossfade that preserves edge continuity without a 3D demo.
    storyScale.value = 0.94;
    storyOpacity.value = 0.5;
    storyScale.value = withSpring(1, Motion.spring.entrance);
    storyOpacity.value = withSpring(1, Motion.spring.entrance);
  }, [storyIndex, storyScale, storyOpacity, reducedMotion]);

  const storyAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: storyScale.value }],
    opacity: storyOpacity.value }));

  // Skip to the next story (account) — used by swipe-left gesture.
  const goNextStory = React.useCallback(() => {
    setProgress(0);
    if (storyIndex < stories.length - 1) {
      haptic.selection();
      setStoryIndex(storyIndex + 1);
      setFrameIndex(0);
    }
  }, [storyIndex, stories.length, haptic]);

  // Go to the previous story (account) — used by swipe-right gesture.
  const goPrevStory = React.useCallback(() => {
    setProgress(0);
    if (storyIndex > 0) {
      haptic.selection();
      setStoryIndex(storyIndex - 1);
      setFrameIndex(0);
    }
  }, [storyIndex, haptic]);

  const handleDelete = async () => {
    if (!activeStory || !isOwner) return;
    haptic.medium();
    setConfirmSheet({
      visible: true,
      title: 'Delete story?',
      message: 'This will permanently remove your poster story.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deletePosterStory(activeStory.id);
          show('Story deleted', 'info');
          navigation.goBack();
        } catch {
          show('Failed to delete story', 'error');
        }
      } });
  };

  const handleArchive = async () => {
    if (!activeStory || !isOwner) return;
    haptic.medium();
    try {
      await archivePosterStory(activeStory.id);
      show('Story archived', 'info');
      navigation.goBack();
    } catch {
      show('Failed to archive story', 'error');
    }
  };

  // Record view when frame changes
  React.useEffect(() => {
    if (!activeFrame || !activeStory || isOwner) return;
    if (recordedFrames.has(activeFrame.id)) return;

    setRecordedFrames((prev) => new Set(prev).add(activeFrame.id));
    recordPosterFrameView(activeFrame.id).catch((err: unknown) => { Sentry.captureException?.(err); });
  }, [activeFrame?.id, activeStory, isOwner, recordedFrames]);

  // Fetch shoppable product tags for the active poster story. Tags are
  // scoped to the poster (story), so we refetch whenever the active story
  // changes. The hotspots themselves are only rendered for the current frame.
  React.useEffect(() => {
    if (!activeStory) {
      setPosterTags([]);
      return;
    }
    let mounted = true;
    fetchPosterTags(activeStory.id)
      .then((res) => {
        if (mounted) setPosterTags(res.tags ?? []);
      })
      .catch(() => {
        if (mounted) setPosterTags([]);
      });
    return () => { mounted = false; };
  }, [activeStory?.id]);

  // Preload the next frame's media and the first frame of the next story
  // to eliminate blank-spinner gaps during navigation (Snapchat/Instagram
  // three-layer preloading pattern).
  React.useEffect(() => {
    if (!activeStory) return;

    const nextFrame = activeStory.frames[frameIndex + 1];
    if (nextFrame?.mediaUrl && !isVideoUrl(nextFrame.mediaUrl)) {
      Image.prefetch(nextFrame.mediaUrl).catch((err: unknown) => { Sentry.captureException?.(err); });
    }

    const nextStory = stories[storyIndex + 1];
    const nextStoryFirstFrame = nextStory?.frames[0];
    if (nextStoryFirstFrame?.mediaUrl && !isVideoUrl(nextStoryFirstFrame.mediaUrl)) {
      Image.prefetch(nextStoryFirstFrame.mediaUrl).catch((err: unknown) => { Sentry.captureException?.(err); });
    }
  }, [activeStory, frameIndex, stories, storyIndex]);

  // Pause when app goes to background
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'active') setIsPaused(true);
    });
    return () => sub.remove();
  }, []);

  // Auto-advance timer
  React.useEffect(() => {
    if (!activeFrame || isPaused || isLoading) return;

    // At the last frame of the last story, don't auto-advance — let the user
    // manually exit.
    const isLastFrameOfLastStory =
      frameIndex >= (activeStory?.frames.length ?? 1) - 1 &&
      storyIndex >= stories.length - 1;
    if (isLastFrameOfLastStory) return;

    // Reduced-motion: skip the animated progress and just advance after the
    // full duration, so there's no visible progress animation.
    if (reducedMotion) {
      const duration = activeFrame.durationMs || 5000;
      const timeoutId = setTimeout(() => {
        goNextFrame();
      }, duration);
      return () => clearTimeout(timeoutId);
    }

    const duration = activeFrame.durationMs || 5000;
    const intervalId = setInterval(() => {
      setProgress((prev) => {
        const next = prev + TICK_MS / duration;
        if (next >= 1) {
          clearInterval(intervalId);
          goNextFrame();
          return 0;
        }
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(intervalId);
  }, [activeFrame?.id, isPaused, isLoading, goNextFrame, reducedMotion, frameIndex, storyIndex, activeStory?.frames.length, stories.length]);

  // Reset media error, pause, and buffering state when frame changes.
  // For video frames, set buffering=true so the indicator shows until onLoad fires.
  // A short delay threshold prevents the buffering indicator from flashing
  // for videos that load quickly (only show after ~400ms).
  React.useEffect(() => {
    setMediaError(false);
    setIsPaused(false);
    const isVideoFrame = activeFrame?.mediaType === 'video' ||
      (activeFrame?.mediaUrl && isVideoUrl(activeFrame.mediaUrl));
    if (isVideoFrame) {
      // Delay showing the buffering indicator to avoid flash on fast loads.
      const thresholdTimer = setTimeout(() => setIsBuffering(true), 400);
      return () => clearTimeout(thresholdTimer);
    }
    setIsBuffering(false);
  }, [activeFrame?.id, activeFrame?.mediaType, activeFrame?.mediaUrl]);

  const handleReaction = React.useCallback(async (reaction: PosterReactionType) => {
    if (!activeFrame) return;
    haptic.light();
    try {
      await setPosterFrameReaction(activeFrame.id, reaction);
      AccessibilityInfo.announceForAccessibility('Reaction sent');
    } catch {
      haptic.error();
      show('Failed to set reaction', 'error');
    }
  }, [activeFrame, haptic, show]);

  // ── Gesture layer (pinch-to-zoom, swipe dismiss, tap zones, heart burst) ──
  // Extracted to usePosterViewerGesture hook — particle physics and gesture
  // handlers are identical to the previous inline implementation.
  const {
    containerPanGesture,
    dismissAnimatedStyle,
    zoomComposedGesture,
    zoomAnimatedStyle,
    leftZoneGesture,
    rightZoneGesture,
    heartBurst } = usePosterViewerGesture({
    activeFrame,
    activeStory,
    compositionDoc,
    reducedMotion,
    goPrevFrame,
    goNextFrame,
    goNextStory,
    goPrevStory,
    handleReaction,
    setIsPaused,
    navigation,
    haptic,
    currentUserId: currentUser?.id });

  const handleRemoveReaction = async () => {
    if (!activeFrame) return;
    try {
      await removePosterFrameReaction(activeFrame.id);
    } catch {
      show('Failed to remove reaction', 'error');
    }
  };

  const handleReply = async (text: string) => {
    if (!activeFrame) return;
    try {
      const replyId = `reply_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
      await createPosterReply(activeFrame.id, { id: replyId, body: text });
      haptic.success();
      show('Reply sent', 'success');
      AccessibilityInfo.announceForAccessibility('Reply sent');
    } catch {
      haptic.error();
      show('Failed to send reply', 'error');
    }
  };

  // ── Sticker interaction handlers ─────────────────────────────────────
  // These handle poll votes, quiz answers, question replies, and style
  // votes. Each shows immediate visual feedback (results/confirmation)
  // in the sticker interaction panel.

  // Reset sticker interaction state when the frame or active sticker changes.
  React.useEffect(() => {
    setActiveInteractionSticker(null);
    activeStickerIdRef.current = null;
    setPollResult(null);
    setQuizResult(null);
    setQuestionAnswer('');
    setQuestionAnswerSent(false);
    setIsStickerSubmitting(false);
  }, [activeFrame?.id]);

  const handlePollVote = React.useCallback(async (stickerId: string, optionId: string) => {
    if (isStickerSubmitting) return;
    setIsStickerSubmitting(true);
    haptic.selection();
    try {
      const result = await votePosterPoll(stickerId, optionId);
      setPollResult(result);
      AccessibilityInfo.announceForAccessibility('Vote submitted');
    } catch {
      haptic.error();
      show('Failed to submit vote', 'error');
    } finally {
      setIsStickerSubmitting(false);
    }
  }, [isStickerSubmitting, haptic, show]);

  const handleQuizVote = React.useCallback(async (stickerId: string, optionId: string) => {
    if (isStickerSubmitting) return;
    setIsStickerSubmitting(true);
    haptic.selection();
    try {
      const result = await votePosterQuiz(stickerId, optionId);
      setQuizResult(result);
      AccessibilityInfo.announceForAccessibility(
        result.isCorrect ? 'Correct answer!' : 'Incorrect answer'
      );
    } catch {
      haptic.error();
      show('Failed to submit answer', 'error');
    } finally {
      setIsStickerSubmitting(false);
    }
  }, [isStickerSubmitting, haptic, show]);

  const handleQuestionSubmit = React.useCallback(async (stickerId: string) => {
    const trimmed = questionAnswer.trim();
    if (!trimmed || isStickerSubmitting) return;
    setIsStickerSubmitting(true);
    haptic.light();
    try {
      await answerPosterQuestion(stickerId, trimmed);
      setQuestionAnswerSent(true);
      haptic.success();
      AccessibilityInfo.announceForAccessibility('Answer sent');
    } catch {
      haptic.error();
      show('Failed to send answer', 'error');
    } finally {
      setIsStickerSubmitting(false);
    }
  }, [questionAnswer, isStickerSubmitting, haptic, show]);

  const handleStyleVote = React.useCallback(async (stickerId: string, optionId: string) => {
    if (isStickerSubmitting) return;
    setIsStickerSubmitting(true);
    haptic.selection();
    try {
      await votePosterStyle(stickerId, optionId);
      setPollResult({
        selectedOptionId: optionId,
        options: [],
        totalVotes: 0 });
      AccessibilityInfo.announceForAccessibility('Vote submitted');
      show('Vote submitted', 'success');
    } catch {
      haptic.error();
      show('Failed to submit vote', 'error');
    } finally {
      setIsStickerSubmitting(false);
    }
  }, [isStickerSubmitting, haptic, show]);

  const handleStickerTap = React.useCallback((sticker: ApiPosterSticker) => {
    haptic.light();
    activeStickerIdRef.current = sticker.id;
    setActiveInteractionSticker(sticker);
    setPollResult(null);
    setQuizResult(null);
    setQuestionAnswer('');
    setQuestionAnswerSent(false);
  }, [haptic]);

  const handleShare = () => {
    haptic.light();
    setShareVisible(true);
  };

  const handleCopyLink = async () => {
    if (!activeStory) return;
    haptic.light();
    const url = `https://thryftverse.com/story/${activeStory.id}`;
    try {
      await Clipboard.setStringAsync(url);
      show('Link copied', 'info');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  // Consolidated "more" menu. Archive, delete, and
  // copy-link are tucked into an action sheet so the top bar stays clean
  // (only mute + close remain visible). Owner-only actions are gated.
  const handleMoreMenu = () => {
    haptic.light();
    const options: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[] = [
      {
        text: 'Copy link',
        onPress: handleCopyLink },
    ];
    if (isOwner) {
      options.push({
        text: 'Archive story',
        onPress: handleArchive });
      options.push({
        text: 'Delete story',
        onPress: handleDelete,
        style: 'destructive' });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    // Map the action menu to ConfirmationSheet — first non-cancel button
    // becomes the confirm action.
    const firstAction = options.find((o) => o.style !== 'cancel' && o.onPress);
    if (firstAction) {
      setConfirmSheet({
        visible: true,
        title: 'Story options',
        message: firstAction.text,
        confirmLabel: firstAction.text,
        variant: firstAction.style === 'destructive' ? 'danger' : 'default',
        onConfirm: () => { firstAction.onPress?.(); } });
    }
  };

  const handleRetryMedia = () => {
    setMediaError(false);
    // Force media components to remount by incrementing a key.
    // This causes CachedImage/Video to re-fetch from the network.
    setMediaRetryKey((k) => k + 1);
    setProgress(0);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <PosterViewerSkeleton />
      </View>
    );
  }

  if (loadError) {
    const isMissing = loadError.kind === 'missing';
    const isOfflineErr = loadError.kind === 'offline';
    const errorIcon: keyof typeof Ionicons.glyphMap = isMissing
      ? 'trash-outline'
      : isOfflineErr
        ? 'cloud-offline-outline'
        : 'alert-circle-outline';
    const errorTitle = isMissing
      ? 'This content is no longer available'
      : isOfflineErr
        ? "You're offline"
        : "Couldn't load this story";
    const errorSub = isMissing
      ? 'It may have been removed by the creator.'
      : isOfflineErr
        ? 'Check your connection and try again.'
        : 'Something went wrong. Try again in a moment.';
    const canRetry = !isMissing;
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <Ionicons name={errorIcon} size={48} color={colors.scrimTextSecondary} />
        <Text style={styles.emptyText}>{errorTitle}</Text>
        <Text style={styles.emptySubText}>{errorSub}</Text>
        {canRetry ? (
          <AnimatedPressable
            onPress={() => {
              setLoadError(null);
              setIsLoading(true);
              // Re-trigger the load effect by calling the same fetch logic
              const reload = async () => {
                try {
                  if (storyId) {
                    const story = await fetchPosterStoryById(storyId);
                    setStories([story]);
                    setStoryIndex(0);
                    setFrameIndex(Math.min(startFrameIndex, story.frames.length - 1));
                  } else {
                    const res = await fetchPosterStories({ active: true, limit: 50 });
                    setStories(res.items);
                    setStoryIndex(0);
                    setFrameIndex(0);
                  }
                } catch (err: unknown) {
                  if (err instanceof ApiRequestError && (err.status === 404 || err.status === 410)) {
                    setLoadError({ kind: 'missing' });
                  } else if (isOffline) {
                    setLoadError({ kind: 'offline' });
                  } else {
                    setLoadError({ kind: 'connection' });
                  }
                } finally {
                  setIsLoading(false);
                }
              };
              void reload();
            }}
            style={styles.closeBtn}
            scaleValue={0.97}
            activeOpacity={0.85}
            hapticFeedback="light"
            accessibilityLabel="Try again"
            accessibilityHint="Retries loading the story"
          >
            <Ionicons name="refresh-outline" size={18} color={colors.scrimTextPrimary} />
            <Text style={styles.closeBtnText}>Try again</Text>
          </AnimatedPressable>
        ) : null}
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={canRetry ? styles.secondaryBtn : styles.closeBtn}
          scaleValue={0.97}
          activeOpacity={0.85}
          hapticFeedback="light"
          accessibilityLabel="Close"
          accessibilityHint="Closes the story viewer and returns to the previous screen"
        >
          <Text style={styles.closeBtnText}>Close</Text>
        </AnimatedPressable>
      </View>
    );
  }

  if (!activeStory || !activeFrame) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.emptyText}>No stories available</Text>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.closeBtn}
          scaleValue={0.97}
          activeOpacity={0.85}
          hapticFeedback="light"
          accessibilityLabel="Close"
          accessibilityHint="Closes the story viewer and returns to the previous screen"
        >
          <Text style={styles.closeBtnText}>Close</Text>
        </AnimatedPressable>
      </View>
    );
  }

  const creatorName = activeStory.creator.username ?? activeStory.creatorId;
  const minutesSincePosted = Math.max(1, Math.floor((Date.now() - new Date(activeStory.createdAt).getTime()) / (60 * 1000)));
  const postedTimeLabel = minutesSincePosted < 60 ? `${minutesSincePosted}m` : `${Math.floor(minutesSincePosted / 60)}h`;
  // Expiration time — shows how long until the story expires (24h lifecycle).
  const minutesUntilExpiry = Math.max(0, Math.floor((new Date(activeStory.expiresAt).getTime() - Date.now()) / (60 * 1000)));
  const expiryLabel = minutesUntilExpiry < 60
    ? `${minutesUntilExpiry}m left`
    : `${Math.floor(minutesUntilExpiry / 60)}h left`;
  const isVideo = activeFrame.mediaType === 'video' || (activeFrame.mediaUrl && isVideoUrl(activeFrame.mediaUrl));

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={containerPanGesture}>
        <Reanimated.View style={[StyleSheet.absoluteFill, dismissAnimatedStyle]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background — canonical composition or legacy media.
          Wrapped in a Reanimated.View for the flat scale/fade story transition. */}
      <Reanimated.View style={[styles.mediaFull, storyAnimatedStyle]}>
      {activeStory?.contentType === 'moodboard' && activeStory.moodboardId ? (
        <MoodboardPosterFrame
          moodboardId={activeStory.moodboardId}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
        />
      ) : compositionDoc && compositionPage ? (
        <CreatorCanvas
          document={compositionDoc}
          page={compositionPage}
          canvasWidth={SCREEN_WIDTH}
          canvasHeight={SCREEN_HEIGHT}
          mode="view"
        />
      ) : isVideo && activeFrame.mediaUrl ? (
        <Video
          key={`video-${activeFrame.id}-${mediaRetryKey}`}
          source={{ uri: activeFrame.mediaUrl }}
          style={styles.mediaFull}
          shouldPlay={!isPaused}
          isMuted={isMuted}
          isLooping={false}
          resizeMode="cover"
          onLoad={() => setIsBuffering(false)}
          onError={() => { setMediaError(true); setIsBuffering(false); }}
        />
      ) : activeFrame.mediaUrl ? (
        <GestureDetector gesture={zoomComposedGesture}>
          <Reanimated.View style={[styles.mediaFull, zoomAnimatedStyle]}>
            <CachedImage
              key={`img-${activeFrame.id}-${mediaRetryKey}`}
              uri={activeFrame.mediaUrl}
              style={styles.mediaFull}
              contentFit="cover"
              priority="high"
              containerStyle={StyleSheet.absoluteFill}
              onError={() => setMediaError(true)}
            />
          </Reanimated.View>
        </GestureDetector>
      ) : (
        <LinearGradient
          colors={[
            activeFrame.backgroundColor ?? '#1a1a1a',
            activeFrame.backgroundColor
              ? shadeColor(activeFrame.backgroundColor, -18)
              : '#0a0a0a',
          ]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={styles.mediaFull}
        >
          {/* Subtle vignette for depth — Instagram Create-mode pattern */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)']}
            style={styles.textFrameVignette}
            pointerEvents="none"
          />
          <Text
            style={[
              styles.textFrameContent,
              { color: activeFrame.backgroundColor === '#ffffff' ? '#000' : '#fff' },
            ]}
          >
            {activeFrame.caption}
          </Text>
        </LinearGradient>
      )}
      </Reanimated.View>

      <View style={styles.backdropOverlay} />

      {/* Top gradient scrim — ensures progress bar, username, and close button
          are always legible regardless of media content.
          Slightly stronger at the top edge so the meta row reads cleanly over
          bright media (white backgrounds, light product photography). */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={styles.topScrim}
        pointerEvents="none"
      />

      {mediaError && (
        <View style={styles.mediaErrorOverlay}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.scrimTextPrimary} />
          <Text style={styles.mediaErrorText}>Unable to load media</Text>
          <AnimatedPressable
            onPress={handleRetryMedia}
            style={styles.retryBtn}
            activeOpacity={0.8}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Retry loading media"
            accessibilityHint="Reloads the story media"
          >
            <Ionicons name="refresh-outline" size={18} color={colors.scrimTextPrimary} />
            <Text style={styles.retryBtnText}>Retry</Text>
          </AnimatedPressable>
        </View>
      )}

      {/* Pause indicator — subtle pill with "Paused" label.
          Appears only when paused by long-press. Refined from a bare circle
          to a soft pill so it reads as a status, not a loading spinner. */}
      {isPaused && !mediaError && (
        <View style={styles.pauseIndicator} pointerEvents="none">
          <Ionicons name="pause" size={16} color={colors.scrimTextSecondary} />
          <Text style={styles.pauseIndicatorText}>Paused</Text>
        </View>
      )}

      {/* Video buffering indicator — shows while video is loading/buffering.
          Progress bar pauses, subtle spinner shows. */}
      {isBuffering && !mediaError && !isPaused && (
        <View style={styles.bufferingIndicator} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.scrimTextSecondary} />
        </View>
      )}

      {/* Double-tap heart burst — Instagram core gesture.
          Shows a floating heart at the tap location that scales up and fades. */}
      {heartBurst && (
        <HeartBurst key={heartBurst.id} x={heartBurst.x} y={heartBurst.y} reducedMotion={reducedMotion} />
      )}

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        {/* Progress segments for frames in current story */}
        <PosterProgressSegments
          total={activeStory.frames.length}
          currentIndex={frameIndex}
          progress={progress}
          isPaused={isPaused}
          isLoading={isLoading}
          reducedMotion={reducedMotion}
        />

        {/* Tap zones for frame navigation.
            The tap layer is positioned between the top meta row and the
            bottom footer using safe-area insets, so it never overlaps the
            reply bar or the top controls. Long-press on either zone pauses
            without advancing (the didLongPressRef flag prevents the tap
            from firing after a hold). */}
        <View
          style={[
            styles.tapLayer,
            { top: insets.top + 52, bottom: insets.bottom + 72 },
          ]}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={leftZoneGesture}>
            <Reanimated.View
              style={styles.tapLeft}
              accessible
              accessibilityLabel="Previous frame"
              accessibilityRole="button"
              accessibilityHint="Double-tap to go back, double-tap again to react with heart"
            />
          </GestureDetector>
          <GestureDetector gesture={rightZoneGesture}>
            <Reanimated.View
              style={styles.tapRight}
              accessible
              accessibilityLabel="Next frame"
              accessibilityRole="button"
              accessibilityHint="Double-tap to go forward, double-tap again to react with heart"
            />
          </GestureDetector>
        </View>

        {/* Top meta row */}
        <View style={styles.topMetaRow}>
          <AnimatedPressable
            style={styles.authorBtn}
            onPress={() => openProfile(navigation, activeStory.creatorId, currentUser?.id)}
            activeOpacity={0.85}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel={`Open @${creatorName} profile`}
            accessibilityRole="button"
            accessibilityHint="Opens the creator's profile"
          >
            {activeStory.creator.avatar ? (
              <CachedImage
                uri={activeStory.creator.avatar}
                style={styles.authorAvatar}
                containerStyle={{ borderRadius: Radius.full, overflow: 'hidden' }}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.authorAvatar, styles.authorAvatarPlaceholder]}>
                <Text style={styles.authorAvatarText}>{creatorName[0]?.toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.authorName}>@{creatorName}</Text>
            {activeStory.creator.isVerified && activeStory.creator.verificationTier && (
              <VerificationBadge tier={activeStory.creator.verificationTier} compact />
            )}
            <Text style={styles.postedTime}>{'\u2022'} {postedTimeLabel}</Text>
          </AnimatedPressable>

          <View style={styles.topControlRow}>
            <AnimatedPressable
              style={styles.topIconBtn}
              onPress={() => { haptic.patterns.toggle(); setIsMuted((m) => !m); }}
              activeOpacity={0.85}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityLabel={isMuted ? 'Unmute sound' : 'Mute sound'}
              accessibilityRole="button"
              accessibilityHint="Toggles audio playback for video frames"
            >
              <Ionicons name={isMuted ? 'volume-mute-outline' : 'volume-high-outline'} size={20} color={colors.scrimTextPrimary} />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.topIconBtn}
              onPress={handleMoreMenu}
              activeOpacity={0.85}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityLabel="More options"
              accessibilityRole="button"
              accessibilityHint="Opens story options: copy link, archive, delete"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.scrimTextPrimary} />
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.topIconBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityLabel="Close viewer"
              accessibilityRole="button"
              accessibilityHint="Closes the story viewer and returns to the previous screen"
            >
              <Ionicons name="close" size={22} color={colors.scrimTextPrimary} />
            </AnimatedPressable>
          </View>
        </View>

        {/* Offline banner — surfaces connectivity loss below the header
            chrome and above the media content. Returns null when online. */}
        {isOffline && (
          <OfflineBanner onRetry={handleRetryMedia} />
        )}

        {/* Stickers overlay — skipped when rendering canonical composition,
            since the composition canvas already includes all layers */}
        {!compositionDoc && activeFrame.stickers.length > 0 && (
          <>
            <PosterStickerLayer
              stickers={activeFrame.stickers}
              containerWidth={SCREEN_WIDTH}
              containerHeight={SCREEN_HEIGHT}
            />
            {/* Mention sticker tap targets — the PosterStickerLayer renders
                stickers with pointerEvents="none" in view mode, so we overlay
                transparent Pressables at mention sticker positions for
                tap-to-view-profile functionality. */}
            <View style={styles.mentionTapLayer} pointerEvents="box-none">
              {activeFrame.stickers
                .filter((s) => s.type === 'mention' && s.payload.userId)
                .map((sticker) => (
                  <Pressable
                    key={sticker.id}
                    style={[
                      styles.mentionTapTarget,
                      {
                        left: sticker.x * SCREEN_WIDTH - 30,
                        top: sticker.y * SCREEN_HEIGHT - 24 },
                    ]}
                    hitSlop={8}
                    accessibilityLabel={`View @${sticker.payload.username}'s profile`}
                    accessibilityRole="button"
                    accessibilityHint="Opens the mentioned user's profile"
                    onPress={() => {
                      if (sticker.payload.userId) {
                        haptic.light();
                        openProfile(navigation, sticker.payload.userId, currentUser?.id);
                      }
                    }}
                  />
                ))}
            </View>

            {/* Interactive sticker tap targets — poll, quiz, question, and
                style_vote stickers are tappable to open an interaction panel.
                The PosterStickerLayer renders these with pointerEvents="none"
                in view mode, so we overlay transparent Pressables at each
                interactive sticker's position. Tapping opens a panel with
                the sticker's options or input field. */}
            <View style={styles.stickerInteractionLayer} pointerEvents="box-none">
              {activeFrame.stickers
                .filter((s) => s.type === 'poll' || s.type === 'quiz' || s.type === 'question' || s.type === 'style_vote')
                .map((sticker) => (
                  <Pressable
                    key={sticker.id}
                    style={[
                      styles.stickerTapTarget,
                      {
                        left: sticker.x * SCREEN_WIDTH - 80,
                        top: sticker.y * SCREEN_HEIGHT - 60 },
                    ]}
                    hitSlop={4}
                    accessibilityLabel={
                      sticker.type === 'poll' ? `Poll: ${sticker.payload.question}` :
                      sticker.type === 'quiz' ? `Quiz: ${sticker.payload.question}` :
                      sticker.type === 'question' ? `Question: ${sticker.payload.question}` :
                      `Style vote: ${sticker.payload.question}`
                    }
                    accessibilityRole="button"
                    accessibilityHint={
                      sticker.type === 'question' ? 'Tap to type an answer' : 'Tap to vote'
                    }
                    onPress={() => handleStickerTap(sticker)}
                  />
                ))}
            </View>
          </>
        )}

        {/* Shoppable product tag hotspots — only for the current frame.
            Coordinates are normalized (0–1) relative to the frame media. */}
        {posterTags.length > 0 && (
          <View style={styles.tagLayer} pointerEvents="box-none">
            {posterTags.map((tag) => (
              <View
                key={tag.id}
                style={[
                  styles.tagHotspot,
                  {
                    left: tag.x * SCREEN_WIDTH,
                    top: tag.y * SCREEN_HEIGHT },
                ]}
              >
                <Pressable
                  hitSlop={12}
                  accessibilityLabel={tag.label}
                  accessibilityRole="button"
                  accessibilityHint="View tagged product"
                  onPress={() => handleTagPress(tag, activeStory, navigation, haptic, show)}
                  style={({ pressed }) => [
                    styles.tagDot,
                    pressed && styles.tagDotPressed,
                  ]}
                >
                  <View style={[styles.tagDotInner, { backgroundColor: colors.brand }]} />
                </Pressable>
                <View style={styles.tagLabelWrap}>
                  <Text style={styles.tagLabelText} numberOfLines={1}>
                    {tag.label}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Caption — skipped when rendering canonical composition.
            3-line clamp with "more" tap to expand.
            The caption sits above the reply bar with deliberate spacing so
            the reply bar remains the primary interactive element. */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.82)']}
          style={[styles.footerGradient, { bottom: 0 }]}
          pointerEvents="none"
        />

        <View style={[styles.viewerFooter, { bottom: insets.bottom }]} pointerEvents="box-none">
          {!compositionDoc && activeFrame.caption && activeFrame.mediaType !== 'text' && (
            <Pressable
              style={styles.captionWrap}
              onPress={() => { haptic.selection(); setCaptionExpanded((v) => !v); }}
              accessibilityLabel={captionExpanded ? 'Collapse caption' : 'Expand caption'}
              accessibilityRole="button"
              accessibilityHint="Toggles caption expansion"
            >
              <Text
                style={styles.captionText}
                numberOfLines={captionExpanded ? undefined : 3}
              >
                <Text style={styles.captionAuthor}>@{creatorName} </Text>
                {activeFrame.caption}
                {!captionExpanded && (
                  <Text style={styles.captionMore}>… more</Text>
                )}
              </Text>
            </Pressable>
          )}

          {/* Subtle expiry indicator — moved here from the top meta row so the
              top stays clean. Sits between caption and
              reply bar as quiet metadata, not a loud badge. */}
          {!compositionDoc && (
            <Text style={styles.footerExpiry} pointerEvents="none">
              {expiryLabel}
            </Text>
          )}

          <PosterReactionReplyBar
            allowReactions={activeStory.allowReactions}
            allowReplies={activeStory.allowReplies}
            viewerReaction={activeFrame.viewerReaction}
            onReaction={handleReaction}
            onRemoveReaction={handleRemoveReaction}
            onReply={handleReply}
            isOwner={isOwner}
            viewerCount={activeStory.uniqueViewerCount}
            onShowActivity={() => navigation.navigate('PosterStoryActivity', { storyId: activeStory.id })}
            onShare={handleShare}
            onSave={() => {
              haptic.light();
              toggleSavedPosterStory(activeStory.id);
              show(isSavedPosterStory(activeStory.id) ? 'Removed from saved' : 'Saved', 'info');
            }}
            isSaved={isSavedPosterStory(activeStory.id)}
          />
        </View>
        {/* Sticker interaction panel — slides up from the bottom when a
            poll, quiz, question, or style_vote sticker is tapped. Shows
            the question, tappable options (with live results after voting),
            or a text input for question stickers. Dismissed by tapping
            outside or pressing close. */}
        {activeInteractionSticker && (
          <StickerInteractionPanel
            sticker={activeInteractionSticker}
            pollResult={pollResult}
            quizResult={quizResult}
            questionAnswer={questionAnswer}
            questionAnswerSent={questionAnswerSent}
            isSubmitting={isStickerSubmitting}
            onQuestionAnswerChange={setQuestionAnswer}
            onPollVote={(optionId) => {
              const id = activeStickerIdRef.current;
              if (id) handlePollVote(id, optionId);
            }}
            onQuizVote={(optionId) => {
              const id = activeStickerIdRef.current;
              if (id) handleQuizVote(id, optionId);
            }}
            onQuestionSubmit={() => {
              const id = activeStickerIdRef.current;
              if (id) handleQuestionSubmit(id);
            }}
            onStyleVote={(optionId) => {
              const id = activeStickerIdRef.current;
              if (id) handleStyleVote(id, optionId);
            }}
            onDismiss={() => {
              activeStickerIdRef.current = null;
              setActiveInteractionSticker(null);
            }}
            colors={colors}
          />
        )}
      </SafeAreaView>

      <ShareSheet
        visible={shareVisible}
        onDismiss={() => setShareVisible(false)}
        url={`https://thryftverse.com/story/${activeStory.id}`}
        title={`@${creatorName}'s story`}
        imageUri={activeFrame.mediaUrl || activeStory.creator.avatar || undefined}
      />
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
        </Reanimated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

// Extracted tag-press handler to keep the component body focused on render.
function handleTagPress(
  tag: PosterTag,
  activeStory: PosterStory,
  navigation: NativeStackNavigationProp<RootStackParamList>,
  haptic: ReturnType<typeof useHaptic>,
  show: (message: string, type?: 'info' | 'error' | 'success') => void,
) {
  haptic.selection();
  recordPosterTagClick(activeStory.id, tag.id).catch((err: unknown) => { Sentry.captureException?.(err); });
  if (tag.listingId) {
    (navigation as unknown as { navigate: (route: string, params: Record<string, unknown>) => void })
      .navigate('ItemDetail', { itemId: tag.listingId });
  } else {
    show('This product is no longer available', 'info');
  }
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors'], screenWidth: number, screenHeight: number) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.md },
  emptyText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  emptySubText: {
    color: colors.scrimTextSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'center' },
  closeBtn: {
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    // Near-transparent chrome. Legibility
    // comes from the top scrim + text shadows, not an opaque pill fill.
    backgroundColor: colors.glassBorder },
  closeBtnText: {
    color: colors.scrimTextPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder },
  mediaFull: {
    position: 'absolute',
    width: screenWidth,
    height: screenHeight,
    justifyContent: 'center',
    alignItems: 'center' },
  textFrameContent: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    textAlign: 'center',
    paddingHorizontal: Space.xl,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12 },
  textFrameVignette: {
    ...StyleSheet.absoluteFill },
  backdropOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay },
  // Top gradient scrim — ensures chrome legibility over any media content
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    zIndex: 5 },
  overlay: {
    flex: 1,
    paddingHorizontal: Space.sm + Space.xs },
  // Tap layer positioned between the top meta row and the bottom footer
  // using safe-area insets. This replaces the fragile Space.xxl*10-40 math.
  tapLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    zIndex: 5 },
  // Instagram-style tap zones: left third for previous frame,
  // right two-thirds for next frame. The "next" action is the primary
  // intent (users advance forward far more often than they go back),
  // so it gets the larger hit area.
  tapLeft: {
    flex: 1 },
  tapRight: {
    flex: 2 },
  topMetaRow: {
    marginTop: Space.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.xs + 2,
    zIndex: 10 },
  authorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minHeight: Control.hit,
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    // Near-transparent chrome. The author
    // name + posted time carry text shadows for legibility over media.
    backgroundColor: colors.glassBg,
    gap: Space.sm },
  authorAvatar: {
    width: Space.lg + 4,
    height: Space.lg + 4,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  authorAvatarPlaceholder: {
    backgroundColor: colors.scrimTextTertiary },
  authorAvatarText: {
    color: colors.scrimTextPrimary,
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.meta.size },
  authorName: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4 },
  postedTime: {
    color: colors.scrimTextSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4 },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  topIconBtn: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    // Near-transparent chrome. Icons rely
    // on the top scrim for legibility rather than an opaque dark disc.
    backgroundColor: colors.glassBg },
  viewerFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: Space.sm + Space.xs,
    zIndex: 20 },
  captionWrap: {
    paddingBottom: Space.sm,
    // Deliberate breathing room above the reply bar so the caption reads
    // as authored content, not a label stuck to the input.
    marginBottom: Space.xs },
  captionText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 2,
    fontFamily: TypographyV2.body.fontFamily,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8 },
  captionAuthor: {
    fontFamily: Typography.family.semibold,
    fontWeight: '600' },
  captionMore: {
    color: colors.scrimTextSecondary,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size },
  footerExpiry: {
    color: colors.scrimTextTertiary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    paddingBottom: Space.xs,
    textShadowColor: colors.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4 },
  footerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 200,
    zIndex: 5 },
  mediaErrorOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    gap: Space.smMd,
    zIndex: 25 },
  mediaErrorText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size,
    color: colors.scrimTextPrimary },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.glassBorder },
  retryBtnText: {
    color: colors.scrimTextPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size },
  pauseIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -44,
    marginTop: -22,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md + 4,
    zIndex: 15 },
  pauseIndicatorText: {
    color: colors.scrimTextSecondary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.wide },
  bufferingIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -16,
    marginTop: -16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15 },
  tagLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 15 },
  mentionTapLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 16 },
  mentionTapTarget: {
    position: 'absolute',
    width: 60,
    height: 48,
    borderRadius: Radius.full },
  // Interactive sticker tap targets — poll, quiz, question, style_vote
  stickerInteractionLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 17 },
  stickerTapTarget: {
    position: 'absolute',
    width: 160,
    height: 120,
    borderRadius: Radius.lg },
  tagHotspot: {
    position: 'absolute',
    alignItems: 'center' },
  tagDot: {
    width: Space.lg,
    height: Space.lg,
    borderRadius: Radius.full,
    backgroundColor: colors.scrimTextPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.floating },
  tagDotPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.9 }] },
  tagDotInner: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.full },
  tagLabelWrap: {
    marginTop: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs - 1,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    maxWidth: 140 },
  tagLabelText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.wide } });
}
