import React from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Dimensions
} from 'react-native';
import { CachedImage } from '../components/CachedImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { MOCK_LISTINGS } from '../data/mockData';
import { mockFind } from '../utils/mockGate';
import { RootStackParamList } from '../navigation/types';
import { getFreshPosters } from '../data/posters';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { SharedTransitionView } from '../components/SharedTransitionView';
import { Typography } from '../constants/typography';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AUTO_ADVANCE_MS = 5000;
const TICK_MS = 50;

type NavT = StackNavigationProp<RootStackParamList>;

export default function PosterViewerScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<any>();
  const { show } = useToast();
  const currentUser = useStore((state) => state.currentUser);
  const markPosterSeen = useStore((state) => state.markPosterSeen);
  const customPosters = useStore((state) => state.customPosters);
  const removePoster = useStore((state) => state.removePoster);

  const posters = React.useMemo(
    () => getFreshPosters(Date.now(), 24, customPosters),
    [customPosters]
  );
  const initialIndex = React.useMemo(() => {
    const idx = posters.findIndex((poster) => poster.id === route.params?.posterId);
    return idx >= 0 ? idx : 0;
  }, [posters, route.params?.posterId]);

  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);
  const [progress, setProgress] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);

  const activePoster = posters[currentIndex];
  const isCustomPoster = !!activePoster && customPosters.some((poster) => poster.id === activePoster.id);
  const isOwnedCustomPoster = isCustomPoster && !!currentUser && activePoster?.uploaderId === currentUser.id;

  const goNext = React.useCallback(() => {
    setProgress(0);

    if (currentIndex >= posters.length - 1) {
      navigation.goBack();
      return;
    }

    setCurrentIndex((prev) => Math.min(prev + 1, posters.length - 1));
  }, [currentIndex, navigation, posters.length]);

  const goPrevious = React.useCallback(() => {
    setProgress(0);
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleDeletePoster = () => {
    if (!activePoster || !isOwnedCustomPoster) {
      return;
    }

    removePoster(activePoster.id);
    show('Poster deleted', 'info');
    navigation.goBack();
  };

  React.useEffect(() => {
    if (!posters.length) {
      navigation.goBack();
      return;
    }

    if (currentIndex > posters.length - 1) {
      setCurrentIndex(posters.length - 1);
      setProgress(0);
      return;
    }

    if (activePoster) {
      markPosterSeen(activePoster.id);
      setProgress(0);
    }
  }, [activePoster?.id, currentIndex, markPosterSeen, navigation, posters.length]);

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
  const uploaderHandle = activePoster.uploader?.username ?? activePoster.uploaderId;
  const storyOverlayPositionStyle =
    activePoster.storyOverlay?.position === 'top'
      ? styles.storyOverlayTop
      : activePoster.storyOverlay?.position === 'center'
        ? styles.storyOverlayCenter
        : styles.storyOverlayBottom;

  const posterImageUri =
    activePoster.image ||
    mockFind(MOCK_LISTINGS, (listing) => listing.id === activePoster.listingId)?.images?.[0] ||
    'https://picsum.photos/seed/poster-fallback-viewer/900/1400';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <SharedTransitionView
        style={StyleSheet.absoluteFillObject}
        sharedTransitionTag={`image-${activePoster.listingId}-0`}
      >
        <CachedImage uri={posterImageUri} style={styles.posterImage} contentFit="cover" priority="high" containerStyle={StyleSheet.absoluteFillObject} />
      </SharedTransitionView>
      <View style={styles.backdropOverlay} />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.progressRow}>
          {posters.map((poster, index) => {
            const fillPercent = index < currentIndex ? 100 : index === currentIndex ? progress * 100 : 0;
            return (
              <View key={poster.id} style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${fillPercent}%` }]} />
              </View>
            );
          })}
        </View>

        {/* Tap layer rendered BEFORE top controls so buttons sit on top */}
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
            onPress={() => navigation.navigate('UserProfile', { userId: activePoster.uploaderId })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Open @${uploaderHandle} profile`}
            accessibilityHint="Shows poster creator profile"
          >
            <CachedImage
              uri={activePoster.uploader?.avatar ?? 'https://picsum.photos/seed/poster-avatar/120/120'}
              style={styles.authorAvatar}
              containerStyle={{ width: 30, height: 30, borderRadius: 15 }}
              contentFit="cover"
            />
            <Text style={styles.authorName}>@{uploaderHandle}</Text>
            <Text style={styles.postedTime}>| {postedTimeLabel}</Text>
          </AnimatedPressable>

          <View style={styles.topControlRow}>
            <AnimatedPressable
              style={styles.topIconBtn}
              onPress={() =>
                navigation.navigate('Chat', {
                  conversationId: `${activePoster.uploaderId}_${activePoster.listingId}`,
                  focusQuery: uploaderHandle,
                  partnerUserId: activePoster.uploaderId,
                  itemId: activePoster.listingId,
                })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Message @${uploaderHandle}`}
              accessibilityHint="Opens chat with poster creator"
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
            </AnimatedPressable>

            <AnimatedPressable style={styles.closeBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
              <Ionicons name="close" size={22} color="#fff" />
            </AnimatedPressable>
          </View>
        </View>

        {isOwnedCustomPoster ? (
          <View style={styles.ownerActionsRow}>
            <AnimatedPressable style={styles.deleteBtn} onPress={handleDeletePoster} activeOpacity={0.85}>
              <Ionicons name="trash-outline" size={14} color="#ffd4d4" />
              <Text style={styles.deleteBtnText}>Delete Poster</Text>
            </AnimatedPressable>
          </View>
        ) : null}

        {activePoster.storyOverlay?.text ? (
          <View style={[styles.storyOverlayWrap, storyOverlayPositionStyle]}>
            <Text style={[styles.storyOverlayText, { color: activePoster.storyOverlay.color }]} numberOfLines={2}>
              {activePoster.storyOverlay.text}
            </Text>
          </View>
        ) : null}

        <View style={styles.bottomMetaWrap}>
          {activePoster.sharedFrom ? (
            <View style={styles.sharedFromPill}>
              <Ionicons name="repeat-outline" size={14} color={Colors.brand} />
              <Text style={styles.sharedFromText}>Shared poster for @{activePoster.sharedFrom.username}</Text>
            </View>
          ) : null}

          <Text style={styles.captionText}>{activePoster.caption}</Text>

          <View style={styles.bottomActionRow}>
            <View style={styles.expiryPill}>
              <Ionicons name="time-outline" size={14} color="#fff" />
              <Text style={styles.expiryText}>Expires in {activePoster.remainingHours}h</Text>
            </View>

            <AnimatedPressable
              style={styles.viewListingBtn}
              activeOpacity={0.9}
              onPress={() => navigation.push('ItemDetail', { itemId: activePoster.listingId })}
            >
              <Text style={styles.viewListingText}>View Listing</Text>
              <Ionicons name="arrow-forward" size={14} color={Colors.background} />
            </AnimatedPressable>
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
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    height: 2,
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
  },
  storyOverlayWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 2,
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
    fontSize: 24,
    lineHeight: 30,
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
    color: '#d7b98f',
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  captionText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
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
});

