import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, TypeStyles, Control } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { isVideoUri } from '../utils/media';
import { useHaptic } from '../hooks/useHaptic';
import { EmptyState } from '../components/EmptyState';

type Props = NativeStackScreenProps<RootStackParamList, 'SharedConversationMedia'>;

const GAP = 2;
const COLS = 3;
const FILTER_THRESHOLD = 6;

type MediaItem = {
  id: string;
  mediaUri: string;
  isVideo: boolean;
  senderLabel: string;
  timestamp?: string;
};

type Filter = 'all' | 'photos' | 'videos';

export default function SharedConversationMediaScreen({ navigation, route }: Props) {
  const { conversationId } = route.params as { conversationId: string };
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const thumbSize = (width - Space.md * 2 - GAP * (COLS - 1)) / COLS;

  const styles = useMemo(() => createStyles(colors), [colors]);

  const conversations = useStore((state) => state.conversations);
  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(t);
  }, [conversationId]);

  const allMedia = useMemo<MediaItem[]>(() => {
    if (!conversation?.messages?.length) return [];
    return conversation.messages
      .filter((m) => m.mediaUri)
      .map((m) => ({
        id: m.id,
        mediaUri: m.mediaUri!,
        isVideo: m.mediaType === 'video' || isVideoUri(m.mediaUri!),
        senderLabel: m.senderId === 'me' ? 'You' : 'Thryft user',
        timestamp: m.timestamp,
      }));
  }, [conversation]);

  const photos = useMemo(() => allMedia.filter((m) => !m.isVideo), [allMedia]);
  const videos = useMemo(() => allMedia.filter((m) => m.isVideo), [allMedia]);

  const showFilter =
    photos.length >= FILTER_THRESHOLD && videos.length >= FILTER_THRESHOLD;

  const filteredMedia = useMemo(() => {
    if (filter === 'photos') return photos;
    if (filter === 'videos') return videos;
    return allMedia;
  }, [allMedia, photos, videos, filter]);

  const handlePress = (item: MediaItem) => {
    haptic.light();
    navigation.navigate('ChatMediaPreview', {
      mediaUri: item.mediaUri,
      mediaType: item.isVideo ? 'video' : 'image',
      senderLabel: item.senderLabel,
      timestamp: item.timestamp,
    });
  };

  const subtitle =
    allMedia.length > 0
      ? `${photos.length} photo${photos.length === 1 ? '' : 's'} · ${videos.length} video${videos.length === 1 ? '' : 's'}`
      : undefined;

  const renderSkeleton = () => {
    const count = COLS * 4;
    return (
      <View style={styles.grid}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonLoader
            key={i}
            width={thumbSize}
            height={thumbSize}
            borderRadius={Radius.sm}
            style={styles.skeletonTile}
          />
        ))}
      </View>
    );
  };

  const renderItem = ({ item }: { item: MediaItem }) => (
    <AnimatedPressable
      style={[styles.thumbWrap, { width: thumbSize, height: thumbSize }]}
      onPress={() => handlePress(item)}
      activeOpacity={0.85}
      scaleValue={0.96}
      hapticFeedback="light"
      accessibilityLabel={item.isVideo ? 'View shared video' : 'View shared photo'}
      accessibilityRole="button"
    >
      {item.isVideo ? (
        <View style={[styles.thumb, styles.videoTile, { width: thumbSize, height: thumbSize }]}>
          <Ionicons name="videocam" size={24} color={colors.textSecondary} />
        </View>
      ) : (
        <CachedImage
          uri={item.mediaUri}
          style={[styles.thumb, { width: thumbSize, height: thumbSize }]}
          contentFit="cover"
        />
      )}
      {item.isVideo && (
        <View style={styles.videoBadge}>
          <Ionicons name="play" size={12} color={colors.textInverse} />
        </View>
      )}
    </AnimatedPressable>
  );

  return (
    <FlagshipScreen
      header={(
        <FlagshipHeader
          title="Shared media"
          subtitle={subtitle}
          onBack={() => navigation.goBack()}
        />
      )}
      scrollEnabled={false}
    >
      {showFilter && !loading && (
        <View style={styles.filterRow}>
          {(['all', 'photos', 'videos'] as Filter[]).map((f) => {
            const active = filter === f;
            const label =
              f === 'all' ? 'All' : f === 'photos' ? 'Photos' : 'Videos';
            return (
              <AnimatedPressable
                key={f}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => {
                  haptic.selection();
                  setFilter(f);
                }}
                activeOpacity={0.7}
                scaleValue={0.96}
                hapticFeedback="selection"
                accessibilityRole="tab"
                accessibilityLabel={`${label} filter`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      )}

      {loading ? (
        renderSkeleton()
      ) : filteredMedia.length === 0 ? (
        <EmptyState
          icon="images-outline"
          title="No shared media yet"
          subtitle="Photos and videos shared in this conversation will appear here."
          ctaLabel="Back"
          onCtaPress={() => navigation.goBack()}
        />
      ) : (
        <FlashList
          data={filteredMedia}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={COLS}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    listContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xxl,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      gap: GAP,
    },
    skeletonTile: {
      marginRight: GAP,
      marginBottom: GAP,
    },
    filterRow: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm,
    },
    filterChip: {
      minHeight: Control.chrome,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterChipActive: {
      backgroundColor: colors.textPrimary,
      borderColor: colors.textPrimary,
    },
    filterText: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textSecondary,
    },
    filterTextActive: {
      color: colors.textInverse,
    },
    thumbWrap: {
      borderRadius: Radius.sm,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      marginRight: GAP,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    thumb: {
      borderRadius: Radius.sm,
    },
    videoTile: {
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    videoBadge: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginTop: -(Space.lg + 4) / 2,
      marginLeft: -(Space.lg + 4) / 2,
      width: Space.lg + 4,
      height: Space.lg + 4,
      borderRadius: Radius.xl,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}
