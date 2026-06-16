import React from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Dimensions,
  AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '../components/CachedImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { fetchPostersFromApi, deletePosterOnApi } from '../services/postersApi';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Type, Typography } from '../theme/designTokens';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AUTO_ADVANCE_MS = 5000;
const TICK_MS = 50;

type NavT = StackNavigationProp<RootStackParamList>;

interface ViewerPoster {
  id: string;
  creatorId: string;
  mediaUrl: string;
  caption: string;
  createdAtMs: number;
  remainingHours: number;
  textOverlay?: { text: string; color: string; position: string; alignment?: string } | null;
}

export default function PosterViewerScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<any>();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const [posters, setPosters] = React.useState<ViewerPoster[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);
  const [mediaError, setMediaError] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetchPostersFromApi({ status: 'published', limit: 40 })
      .then((res) => {
        if (!mounted) return;
        const now = Date.now();
        const mapped = res.items.map((p) => {
          const createdAtMs = new Date(p.createdAt).getTime();
          const expiresAtMs = createdAtMs + (p.expiryHours ?? 24) * 60 * 60 * 1000;
          const remainingHours = Math.max(0, Math.ceil((expiresAtMs - now) / (60 * 60 * 1000)));
          return {
            id: p.id,
            creatorId: p.creatorId,
            mediaUrl: p.mediaUrl,
            caption: p.caption,
            createdAtMs,
            remainingHours,
            textOverlay: p.textOverlay ? {
              text: String(p.textOverlay.text ?? ''),
              color: String(p.textOverlay.color ?? '#ffffff'),
              position: String(p.textOverlay.position ?? 'bottom'),
              alignment: String(p.textOverlay.alignment ?? 'center'),
            } : null,
          };
        }).filter((p) => p.remainingHours > 0);
        setPosters(mapped);
        const idx = mapped.findIndex((poster) => poster.id === route.params?.posterId);
        setCurrentIndex(idx >= 0 ? idx : 0);
      })
      .catch(() => {
        if (mounted) show('Could not load posters', 'error');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, [route.params?.posterId, show]);

  const activePoster = posters[currentIndex];
  const isOwnedPoster = !!activePoster && !!currentUser && activePoster.creatorId === currentUser.id;

  const goNext = React.useCallback(() => {
    setProgress(0);
    if (currentIndex >= posters.length - 1) {
      navigation.goBack();
      return;
    }
    setCurrentIndex((prev: number) => Math.min(prev + 1, posters.length - 1));
  }, [currentIndex, navigation, posters.length]);

  const goPrevious = React.useCallback(() => {
    setProgress(0);
    setCurrentIndex((prev: number) => Math.max(0, prev - 1));
  }, []);

  const handleDeletePoster = async () => {
    if (!activePoster || !isOwnedPoster) return;
    try {
      await deletePosterOnApi(activePoster.id);
      show('Poster deleted', 'info');
      navigation.goBack();
    } catch {
      show('Failed to delete poster', 'error');
    }
  };

  // Pause when app goes to background
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'active') {
        setIsPaused(true);
      }
    });
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    if (!posters.length) {
      if (!isLoading) navigation.goBack();
      return;
    }
    if (currentIndex > posters.length - 1) {
      setCurrentIndex(posters.length - 1);
      setProgress(0);
      return;
    }
    setProgress(0);
  }, [activePoster?.id, currentIndex, navigation, posters.length, isLoading]);

  React.useEffect(() => {
    if (!activePoster || isPaused) {
      return;
    }

    const intervalId = setInterval(() => {
      setProgress((prev) => {
        const next = prev + TICK_MS / AUTO_ADVANCE_MS;
        if (next >= 1) {
          clearInterval(intervalId);
          goNext();
          return 1;
        }

        return next;
      });
    }, TICK_MS);

    return () => clearInterval(intervalId);
  }, [activePoster?.id, goNext, isPaused]);

  if (!activePoster) {
    return null;
  }

  const minutesSincePosted = Math.max(1, Math.floor((Date.now() - activePoster.createdAtMs) / (60 * 1000)));
  const postedTimeLabel = minutesSincePosted < 60 ? `${minutesSincePosted}m` : `${Math.floor(minutesSincePosted / 60)}h`;
  const uploaderHandle = activePoster.creatorId;
  const textOverlayPositionStyle =
    activePoster.textOverlay?.position === 'top'
      ? styles.storyOverlayTop
      : activePoster.textOverlay?.position === 'center'
        ? styles.storyOverlayCenter
        : styles.storyOverlayBottom;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <CachedImage
        uri={activePoster.mediaUrl}
        style={styles.posterImage}
        contentFit="cover"
        priority="high"
        containerStyle={StyleSheet.absoluteFillObject}
        onError={() => setMediaError(true)}
      />
      <View style={styles.backdropOverlay} />
      {mediaError && (
        <View style={styles.mediaErrorOverlay}>
          <Ionicons name="alert-circle-outline" size={48} color="#fff" />
          <Text style={styles.mediaErrorText}>Unable to load media</Text>
        </View>
      )}

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.progressRow}>
          {posters.map((poster: ViewerPoster, index: number) => {
            const fillPercent = index < currentIndex ? 100 : index === currentIndex ? progress * 100 : 0;
            return (
              <View key={poster.id} style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${fillPercent}%` }]} />
              </View>
            );
          })}
        </View>

        <View style={styles.tapLayer} pointerEvents="box-none">
          <Pressable
            style={styles.tapLeft}
            onPress={goPrevious}
            onPressIn={() => setIsPaused(true)}
            onPressOut={() => setIsPaused(false)}
          />
          <Pressable
            style={styles.tapRight}
            onPress={goNext}
            onPressIn={() => setIsPaused(true)}
            onPressOut={() => setIsPaused(false)}
          />
        </View>

        <View style={styles.topMetaRow}>
          <AnimatedPressable
            style={styles.authorIdentityBtn}
            onPress={() => navigation.navigate('UserProfile', { userId: activePoster.creatorId })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Open @${uploaderHandle} profile`}
            accessibilityHint="Shows poster creator profile"
          >
            <CachedImage uri="" style={styles.authorAvatar} containerStyle={{ borderRadius: 14, overflow: 'hidden' }} contentFit="cover" />
            <Text style={styles.authorName}>@{uploaderHandle}</Text>
            <Text style={styles.postedTime}>| {postedTimeLabel}</Text>
          </AnimatedPressable>

          <View style={styles.topControlRow}>
            <AnimatedPressable style={styles.closeBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Ionicons name="close" size={22} color="#fff" />
            </AnimatedPressable>
          </View>
        </View>

        {isOwnedPoster ? (
          <View style={styles.ownerActionsRow}>
            <AnimatedPressable style={styles.deleteBtn} onPress={handleDeletePoster} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={14} color="#ffd4d4" />
              <Text style={styles.deleteBtnText}>Delete Poster</Text>
            </AnimatedPressable>
          </View>
        ) : null}

        {activePoster.textOverlay?.text ? (
          <View style={[styles.storyOverlayWrap, textOverlayPositionStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.35)']}
              style={styles.textOverlayGradient}
              pointerEvents="none"
            />
            <Text style={[styles.storyOverlayText, { color: activePoster.textOverlay.color }]} numberOfLines={2}>
              {activePoster.textOverlay.text}
            </Text>
          </View>
        ) : null}

        <View style={styles.bottomMetaWrap}>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)']}
            style={styles.bottomGradient}
            pointerEvents="none"
          />
          <View style={styles.captionWrap}>
            <Text style={styles.captionText}>{activePoster.caption}</Text>
          </View>

          <View style={styles.bottomActionRow}>
            <View style={styles.expiryPill}>
              <Ionicons name="time-outline" size={14} color="#fff" />
              <Text style={styles.expiryText}>Expires in {activePoster.remainingHours}h</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  posterImage: {
    position: 'absolute',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  overlay: {
    flex: 1,
    paddingHorizontal: 12,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
  },
  progressTrack: {
    flex: 1,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1,
    backgroundColor: '#fff',
  },
  topMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  authorIdentityBtn: {
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
    gap: 8,
  },
  topIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  ownerActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(64, 20, 20, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 110, 110, 0.45)',
  },
  deleteBtnText: {
    color: '#ffd4d4',
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  bottomMetaWrap: {
    marginTop: 'auto',
    paddingBottom: 28,
    gap: 10,
    position: 'relative',
  },
  bottomGradient: {
    position: 'absolute',
    left: -12,
    right: -12,
    bottom: -28,
    height: 160,
  },
  captionWrap: {
    position: 'relative',
    zIndex: 2,
  },
  storyOverlayWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 2,
  },
  textOverlayGradient: {
    position: 'absolute',
    left: -20,
    right: -20,
    top: -40,
    bottom: -40,
  },
  storyOverlayTop: {
    top: 120,
  },
  storyOverlayCenter: {
    top: '44%',
  },
  storyOverlayBottom: {
    bottom: 180,
  },
  storyOverlayText: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowRadius: 8,
    letterSpacing: 0.3,
  },
  sharedFromPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  sharedFromText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  captionText: {
    color: '#fff',
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 8,
  },
  bottomActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
    position: 'relative',
    zIndex: 2,
  },
  expiryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  expiryText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  viewListingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.brand,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  viewListingText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: Typography.family.bold,
  },
  tapLayer: {
    position: 'absolute',
    top: 120,
    bottom: 110,
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
});;