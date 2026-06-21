import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Dimensions,
  AppState,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import {
  fetchPosterStories,
  fetchPosterStoryById,
  recordPosterFrameView,
  setPosterFrameReaction,
  removePosterFrameReaction,
  createPosterReply,
  deletePosterStory,
  archivePosterStory,
} from '../services/postersApi';
import type {
  PosterStory,
  PosterFrame,
  PosterReactionType,
} from '../services/postersApi';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Type, Typography, Space } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PosterProgressSegments } from '../components/poster/PosterProgressSegments';
import { PosterStickerLayer } from '../components/poster/PosterStickerLayer';
import { PosterReactionReplyBar } from '../components/poster/PosterReactionReplyBar';
import { CachedImage } from '../components/CachedImage';
import { Video } from '../components/compat/Video';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TICK_MS = 50;

type NavT = StackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'PosterViewer'>;

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|m4v|quicktime)$/i.test(url);
}

export default function PosterViewerScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);

  const [stories, setStories] = React.useState<PosterStory[]>([]);
  const [storyIndex, setStoryIndex] = React.useState(0);
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [mediaError, setMediaError] = React.useState(false);
  const [recordedFrames, setRecordedFrames] = React.useState<Set<string>>(new Set());

  const storyId = route.params?.storyId;
  const startFrameIndex = route.params?.startFrameIndex ?? 0;

  React.useEffect(() => {
    let mounted = true;
    setIsLoading(true);

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
      } catch {
        if (mounted) show('Could not load poster stories', 'error');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadStories();
    return () => { mounted = false; };
  }, [storyId, startFrameIndex, show]);

  const activeStory = stories[storyIndex];
  const activeFrame: PosterFrame | undefined = activeStory?.frames[frameIndex];
  const isOwner = !!activeStory && !!currentUser && activeStory.creatorId === currentUser.id;

  const goNextFrame = React.useCallback(() => {
    setProgress(0);
    if (!activeStory) return;
    if (frameIndex < activeStory.frames.length - 1) {
      setFrameIndex(frameIndex + 1);
    } else if (storyIndex < stories.length - 1) {
      setStoryIndex(storyIndex + 1);
      setFrameIndex(0);
    } else {
      navigation.goBack();
    }
  }, [activeStory, frameIndex, storyIndex, stories.length, navigation]);

  const goPrevFrame = React.useCallback(() => {
    setProgress(0);
    if (frameIndex > 0) {
      setFrameIndex(frameIndex - 1);
    } else if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
      setFrameIndex(Math.max(0, (stories[storyIndex - 1]?.frames.length ?? 1) - 1));
    }
  }, [frameIndex, storyIndex, stories]);

  const handleDelete = async () => {
    if (!activeStory || !isOwner) return;
    Alert.alert(
      'Delete story?',
      'This will permanently remove your poster story.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePosterStory(activeStory.id);
              show('Story deleted', 'info');
              navigation.goBack();
            } catch {
              show('Failed to delete story', 'error');
            }
          },
        },
      ]
    );
  };

  const handleArchive = async () => {
    if (!activeStory || !isOwner) return;
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
    recordPosterFrameView(activeFrame.id).catch(() => {});
  }, [activeFrame?.id, activeStory, isOwner, recordedFrames]);

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
  }, [activeFrame?.id, isPaused, isLoading, goNextFrame]);

  const handleReaction = async (reaction: PosterReactionType) => {
    if (!activeFrame) return;
    try {
      await setPosterFrameReaction(activeFrame.id, reaction);
    } catch {
      show('Failed to set reaction', 'error');
    }
  };

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
      const replyId = `reply_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      await createPosterReply(activeFrame.id, { id: replyId, body: text });
      show('Reply sent', 'success');
    } catch {
      show('Failed to send reply', 'error');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!activeStory || !activeFrame) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.emptyText}>No stories available</Text>
        <AnimatedPressable onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Close</Text>
        </AnimatedPressable>
      </View>
    );
  }

  const creatorName = activeStory.creator.username ?? activeStory.creatorId;
  const minutesSincePosted = Math.max(1, Math.floor((Date.now() - new Date(activeStory.createdAt).getTime()) / (60 * 1000)));
  const postedTimeLabel = minutesSincePosted < 60 ? `${minutesSincePosted}m` : `${Math.floor(minutesSincePosted / 60)}h`;
  const isVideo = activeFrame.mediaType === 'video' || (activeFrame.mediaUrl && isVideoUrl(activeFrame.mediaUrl));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background media */}
      {isVideo && activeFrame.mediaUrl ? (
        <Video
          source={{ uri: activeFrame.mediaUrl }}
          style={styles.mediaFull}
          shouldPlay={!isPaused}
          isMuted={false}
          isLooping={false}
          resizeMode="cover"
          onError={() => setMediaError(true)}
        />
      ) : activeFrame.mediaUrl ? (
        <CachedImage
          uri={activeFrame.mediaUrl}
          style={styles.mediaFull}
          contentFit="cover"
          priority="high"
          containerStyle={StyleSheet.absoluteFillObject}
          onError={() => setMediaError(true)}
        />
      ) : (
        <View style={[styles.mediaFull, { backgroundColor: activeFrame.backgroundColor ?? '#1a1a1a' }]}>
          <Text
            style={[
              styles.textFrameContent,
              { color: activeFrame.backgroundColor === '#ffffff' ? '#000' : '#fff' },
            ]}
          >
            {activeFrame.caption}
          </Text>
        </View>
      )}

      <View style={styles.backdropOverlay} />

      {mediaError && (
        <View style={styles.mediaErrorOverlay}>
          <Ionicons name="alert-circle-outline" size={48} color="#fff" />
          <Text style={styles.mediaErrorText}>Unable to load media</Text>
        </View>
      )}

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        {/* Progress segments for frames in current story */}
        <PosterProgressSegments
          total={activeStory.frames.length}
          currentIndex={frameIndex}
          progress={progress}
          isPaused={isPaused}
        />

        {/* Story navigation dots if multiple stories */}
        {stories.length > 1 && (
          <View style={styles.storyDots}>
            {stories.map((s, i) => (
              <View
                key={s.id}
                style={[styles.storyDot, i === storyIndex && styles.storyDotActive]}
              />
            ))}
          </View>
        )}

        {/* Tap zones for frame navigation */}
        <View style={styles.tapLayer} pointerEvents="box-none">
          <Pressable
            style={styles.tapLeft}
            onPress={goPrevFrame}
            onPressIn={() => setIsPaused(true)}
            onPressOut={() => setIsPaused(false)}
            accessibilityLabel="Previous frame"
            accessibilityRole="button"
          />
          <Pressable
            style={styles.tapRight}
            onPress={goNextFrame}
            onPressIn={() => setIsPaused(true)}
            onPressOut={() => setIsPaused(false)}
            accessibilityLabel="Next frame"
            accessibilityRole="button"
          />
        </View>

        {/* Top meta row */}
        <View style={styles.topMetaRow}>
          <AnimatedPressable
            style={styles.authorBtn}
            onPress={() => navigation.navigate('UserProfile', { userId: activeStory.creatorId })}
            activeOpacity={0.85}
            accessibilityLabel={`Open @${creatorName} profile`}
            accessibilityRole="button"
          >
            {activeStory.creator.avatar ? (
              <CachedImage
                uri={activeStory.creator.avatar}
                style={styles.authorAvatar}
                containerStyle={{ borderRadius: 14, overflow: 'hidden' }}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.authorAvatar, styles.authorAvatarPlaceholder]}>
                <Text style={styles.authorAvatarText}>{creatorName[0]?.toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.authorName}>@{creatorName}</Text>
            <Text style={styles.postedTime}>| {postedTimeLabel}</Text>
          </AnimatedPressable>

          <View style={styles.topControlRow}>
            {isOwner && (
              <>
                <AnimatedPressable
                  style={styles.topIconBtn}
                  onPress={handleArchive}
                  activeOpacity={0.8}
                  accessibilityLabel="Archive story"
                >
                  <Ionicons name="archive-outline" size={20} color="#fff" />
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.topIconBtn}
                  onPress={handleDelete}
                  activeOpacity={0.8}
                  accessibilityLabel="Delete story"
                >
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                </AnimatedPressable>
              </>
            )}
            <AnimatedPressable
              style={styles.closeBtnTop}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
              accessibilityLabel="Close viewer"
            >
              <Ionicons name="close" size={22} color="#fff" />
            </AnimatedPressable>
          </View>
        </View>

        {/* Stickers overlay */}
        {activeFrame.stickers.length > 0 && (
          <PosterStickerLayer
            stickers={activeFrame.stickers}
            containerWidth={SCREEN_WIDTH}
            containerHeight={SCREEN_HEIGHT}
          />
        )}

        {/* Caption */}
        {activeFrame.caption && activeFrame.mediaType !== 'text' && (
          <View style={styles.captionWrap}>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.5)']}
              style={styles.bottomGradient}
              pointerEvents="none"
            />
            <Text style={styles.captionText}>{activeFrame.caption}</Text>
          </View>
        )}

        {/* Reaction / Reply bar */}
        <PosterReactionReplyBar
          allowReactions={activeStory.allowReactions}
          allowReplies={activeStory.allowReplies}
          viewerReaction={activeFrame.viewerReaction}
          onReaction={handleReaction}
          onRemoveReaction={handleRemoveReaction}
          onReply={handleReply}
          isOwner={isOwner}
          onShowActivity={() => navigation.navigate('PosterStoryActivity', { storyId: activeStory.id })}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Space.md,
  },
  emptyText: {
    color: '#fff',
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  closeBtn: {
    paddingHorizontal: Space.md + 4,
    paddingVertical: Space.sm,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  closeBtnText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  mediaFull: {
    position: 'absolute',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textFrameContent: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    textAlign: 'center',
    paddingHorizontal: Space.lg,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  overlay: {
    flex: 1,
    paddingHorizontal: 12,
  },
  storyDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: 6,
  },
  storyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  storyDotActive: {
    backgroundColor: '#fff',
  },
  topMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  authorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.32)',
    gap: 8,
  },
  authorAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  authorAvatarText: {
    color: '#fff',
    fontFamily: Typography.family.bold,
    fontSize: 13,
  },
  authorName: {
    color: '#fff',
    fontSize: 13,
    fontFamily: Typography.family.bold,
  },
  postedTime: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: Typography.family.medium,
    marginLeft: 4,
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  closeBtnTop: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  tapLayer: {
    position: 'absolute',
    top: 120,
    bottom: 120,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  tapLeft: {
    flex: 1,
  },
  tapRight: {
    flex: 1,
  },
  captionWrap: {
    marginTop: 'auto',
    paddingBottom: 8,
    position: 'relative',
  },
  bottomGradient: {
    position: 'absolute',
    left: -12,
    right: -12,
    bottom: -8,
    height: 80,
  },
  captionText: {
    color: '#fff',
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 8,
    paddingHorizontal: 4,
  },
  mediaErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    gap: 12,
  },
  mediaErrorText: {
    fontFamily: Typography.family.medium,
    fontSize: 16,
    color: '#fff',
  },
});
