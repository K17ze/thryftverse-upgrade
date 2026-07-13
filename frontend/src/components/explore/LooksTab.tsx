import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/types';
import { EmptyState } from '../EmptyState';
import { DiscoverySectionHeader } from '../discover/DiscoverySectionHeader';
import { fetchLooksFromApi, type LookApiItem } from '../../services/looksApi';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = StackNavigationProp<RootStackParamList>;

function LookCard({
  look,
  onPress,
  index,
}: {
  look: LookApiItem;
  onPress: () => void;
  index: number;
}) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  return (
    <Reanimated.View entering={FadeInDown.duration(350).delay(index * 80).springify()}>
      <AnimatedPressable style={styles.card} onPress={onPress} activeOpacity={0.92} accessibilityRole="button" accessibilityLabel={`Look by ${look.creator.username ?? 'unknown'}`}>
        <View style={styles.imageWrap}>
          <SharedTransitionView style={styles.imageShared} sharedTransitionTag={`look-${look.id}`}>
            <CachedImage
              uri={look.mediaUrl}
              style={styles.image}
              containerStyle={{ width: '100%', height: '100%' }}
              contentFit="cover"
              emptyLabel={look.title || look.caption}
              emptyIcon="image-outline"
            />
          </SharedTransitionView>

          {look.tags.map((tag) => {
            const isActive = activeTag === tag.id;
            return (
              <Pressable
                key={tag.id}
                style={[styles.tagWrap, { left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }]}
                onPress={(e) => {
                  e.stopPropagation();
                  setActiveTag(isActive ? null : tag.id);
                }}
                hitSlop={16}
                accessibilityRole="button"
                accessibilityLabel={tag.label || 'Tagged item'}
              >
                <View style={styles.tagDot} />
                {isActive && (
                  <Reanimated.View entering={FadeInDown.duration(180)} style={styles.tagPill}>
                    <Text style={styles.tagPillText} numberOfLines={1}>{tag.label || 'Untitled'}</Text>
                  </Reanimated.View>
                )}
              </Pressable>
            );
          })}

          {look.tags.length > 0 && (
            <View style={styles.tagBadge}>
              <Ionicons name="pricetag" size={10} color={Colors.brand} />
              <Text style={styles.tagBadgeText}>{look.tags.length}</Text>
            </View>
          )}

          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.gradient}
          />

          <View style={styles.overlayInfo}>
            <Text style={styles.overlayTitle} numberOfLines={2}>{look.caption || look.title}</Text>
            <Text style={styles.overlayCreator}>@{look.creator.username ?? 'unknown'}</Text>
          </View>

          <View style={styles.overlayStats}>
            <View style={styles.overlayStatBtn}>
              <Ionicons name={look.likedByViewer ? 'heart' : 'heart-outline'} size={14} color={look.likedByViewer ? Colors.danger : '#fff'} />
              <Text style={styles.overlayStatCount}>{look.likeCount}</Text>
            </View>
            <View style={styles.overlayStatBtn}>
              <Ionicons name="chatbubble-outline" size={13} color="rgba(255,255,255,0.9)" />
              <Text style={styles.overlayStatCount}>{look.commentCount}</Text>
            </View>
            <View style={styles.overlayStatBtn}>
              <Ionicons name={look.savedByViewer ? 'bookmark' : 'bookmark-outline'} size={13} color={look.savedByViewer ? Colors.brand : 'rgba(255,255,255,0.9)'} />
            </View>
          </View>
        </View>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

export default function LooksTab() {
  const navigation = useNavigation<NavT>();
  const [looks, setLooks] = useState<LookApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLooks = useCallback(async (isRefresh: boolean = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    }
    setLoadError(null);
    try {
      const res = await fetchLooksFromApi({ status: 'published' });
      setLooks(res.items ?? []);
    } catch {
      if (!isRefresh && looks.length === 0) {
        setLoadError('Looks could not be loaded.\nCheck your connection and try again.');
      } else if (isRefresh) {
        setLoadError('Looks could not be refreshed.\nShowing the last loaded posts.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [looks.length]);

  useEffect(() => {
    loadLooks();
  }, [loadLooks]);

  const handleRefresh = useCallback(() => {
    loadLooks(true);
  }, [loadLooks]);

  const handleCreateLook = useCallback(() => {
    navigation.navigate('CreatorStudio', { type: 'look' });
  }, [navigation]);

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  if (loadError && looks.length === 0) {
    return (
      <Reanimated.View entering={FadeInDown.duration(400)} style={styles.errorWrap}>
        <Ionicons name="cloud-offline-outline" size={40} color={Colors.textMuted} />
        <Text style={styles.errorTitle}>Looks could not be loaded</Text>
        <Text style={styles.errorSubtitle}>Check your connection and try again.</Text>
        <AnimatedPressable
          style={styles.retryBtn}
          onPress={() => {
            setIsLoading(true);
            loadLooks();
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Retry loading looks"
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </AnimatedPressable>
      </Reanimated.View>
    );
  }

  if (looks.length === 0 && !loadError) {
    return (
      <Reanimated.View entering={FadeInDown.duration(400)}>
        <EmptyState
          icon="camera-outline"
          title="No looks yet"
          subtitle="Create a look, tag real products, and share your style with the community."
          ctaLabel="Create a Look"
          onCtaPress={handleCreateLook}
          graphic={
            <View style={{ alignItems: 'center', marginBottom: Space.md }}>
              <Ionicons name="images-outline" size={48} color={Colors.brand} />
            </View>
          }
        />
      </Reanimated.View>
    );
  }

  return (
    <FlatList
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={Colors.brand} />
      }
      ListHeaderComponent={
        <View>
          <DiscoverySectionHeader kicker="Community" title="Looks" />
          {loadError && looks.length > 0 && (
            <View style={styles.refreshErrorBanner}>
              <Text style={styles.refreshErrorText}>Looks could not be refreshed. Showing the last loaded posts.</Text>
              <Pressable
                onPress={() => loadLooks(true)}
                accessibilityRole="button"
                accessibilityLabel="Retry refresh"
              >
                <Text style={styles.retryLink}>Retry</Text>
              </Pressable>
            </View>
          )}
        </View>
      }
      data={looks}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => (
        <LookCard
          look={item}
          onPress={() => navigation.navigate('LookDetail', { lookId: item.id })}
          index={index}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  errorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  errorSubtitle: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: Space.sm,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.brand,
    borderRadius: 20,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  refreshErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    marginBottom: Space.md,
    gap: Space.sm,
  },
  refreshErrorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  retryLink: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    marginBottom: Space.lg,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    height: SCREEN_W * 1.1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageShared: {
    ...StyleSheet.absoluteFill,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  overlayInfo: {
    position: 'absolute',
    bottom: 44,
    left: Space.md,
    right: 100,
  },
  overlayTitle: {
    fontFamily: Typography.family.bold,
    fontSize: 18,
    color: '#fff',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  overlayCreator: {
    fontFamily: Typography.family.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  overlayStats: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  overlayStatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  overlayStatCount: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  tagWrap: {
    position: 'absolute',
    zIndex: 3,
  },
  tagDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  tagPill: {
    position: 'absolute',
    left: 20,
    top: -6,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagPillText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: Typography.family.medium,
    marginLeft: 6,
  },
  tagBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    zIndex: 2,
  },
  tagBadgeText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});