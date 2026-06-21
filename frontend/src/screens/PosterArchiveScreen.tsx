import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Dimensions,
  Alert,
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
import { fetchPosterStoryArchive, deletePosterStory } from '../services/postersApi';
import type { PosterStory } from '../services/postersApi';
import { CachedImage } from '../components/CachedImage';

type Props = StackScreenProps<RootStackParamList, 'PosterArchive'>;

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - Space.md * 3) / 2;
const CARD_H = CARD_W * (16 / 9);

export default function PosterArchiveScreen({ navigation }: Props) {
  const { isDark } = useAppTheme();
  const { show } = useToast();

  const [stories, setStories] = useState<PosterStory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadArchive = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const res = await fetchPosterStoryArchive({ includeActive: true });
      setStories(res.items);
    } catch {
      show('Could not load archive', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [show]);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  const handleDelete = (storyId: string) => {
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
              await deletePosterStory(storyId);
              setStories((prev) => prev.filter((s) => s.id !== storyId));
              show('Story deleted', 'info');
            } catch {
              show('Failed to delete story', 'error');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: PosterStory }) => {
    const firstFrame = item.frames[0];
    const isActive = item.status === 'active';
    const expiresAt = new Date(item.expiresAt).getTime();
    const isExpired = expiresAt <= Date.now();
    const hoursLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / (60 * 60 * 1000)));

    return (
      <Pressable
        onPress={() => navigation.navigate('PosterViewer', { storyId: item.id })}
        style={styles.card}
        accessibilityLabel={`Story with ${item.totalFrameCount} frames${isActive ? ` (${hoursLeft}h left)` : ' (archived)'}`}
      >
        <View style={styles.cardMedia}>
          {firstFrame?.mediaUrl ? (
            <CachedImage
              uri={firstFrame.mediaUrl}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              containerStyle={{ borderRadius: Radius.lg, overflow: 'hidden' }}
            />
          ) : (
            <View style={[styles.cardPlaceholder, { backgroundColor: firstFrame?.backgroundColor ?? Colors.surfaceAlt }]}>
              <Text style={styles.cardPlaceholderText} numberOfLines={2}>
                {firstFrame?.caption || 'Text story'}
              </Text>
            </View>
          )}
          <View style={styles.cardOverlay}>
            {isActive ? (
              <View style={[styles.statusPill, styles.statusActive]}>
                <Text style={styles.statusText}>{hoursLeft}h left</Text>
              </View>
            ) : (
              <View style={[styles.statusPill, styles.statusArchived]}>
                <Text style={styles.statusText}>Archived</Text>
              </View>
            )}
            {item.totalFrameCount > 1 && (
              <View style={styles.frameCountPill}>
                <Ionicons name="layers" size={12} color="#fff" />
                <Text style={styles.frameCountText}>{item.totalFrameCount}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardDate}>
            {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>
          <Pressable onPress={() => handleDelete(item.id)} accessibilityLabel="Delete story">
            <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7} scaleValue={0.9} hapticFeedback="light">
            <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>Archive</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.topBar}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          activeOpacity={0.7}
          scaleValue={0.9}
          hapticFeedback="light"
        >
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>My Poster Archive</Text>
        <View style={styles.iconBtn} />
      </View>

      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadArchive(true)}
            tintColor={Colors.brand}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBody}>
            <Ionicons name="archive-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No archived stories</Text>
            <Text style={styles.emptySubtitle}>Your past poster stories will appear here</Text>
          </View>
        }
      />
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
  loadingBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xl,
  },
  columnWrapper: {
    gap: Space.md,
    marginBottom: Space.md,
  },
  card: {
    width: CARD_W,
  },
  cardMedia: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  cardPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
  },
  cardPlaceholderText: {
    color: '#fff',
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    textAlign: 'center',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: Space.xs,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusActive: {
    backgroundColor: 'rgba(76, 217, 100, 0.85)',
  },
  statusArchived: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Typography.family.semibold,
  },
  frameCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  frameCountText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Typography.family.semibold,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.xs,
  },
  cardDate: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  emptyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Space.xxl,
    gap: Space.sm,
  },
  emptyTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
});
