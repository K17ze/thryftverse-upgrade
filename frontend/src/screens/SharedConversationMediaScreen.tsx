import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, TypeStyles, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { isVideoUri } from '../utils/media';
import { useHaptic } from '../hooks/useHaptic';
import { EmptyState } from '../components/EmptyState';
import { useAppTranslation } from '../i18n/useAppTranslation';

type Props = NativeStackScreenProps<RootStackParamList, 'SharedConversationMedia'>;

const GAP = 2;
const COLS = 3;
const FILTER_THRESHOLD = 6;
const CHECK_SIZE = 22;
const VIDEO_PLAY_BADGE = 40;
const VIDEO_PLAY_ICON = 22;

type MediaItem = {
  id: string;
  mediaUri: string;
  isVideo: boolean;
  senderLabel: string;
  timestamp?: string;
  /**
   * Optional poster/thumbnail URL for video items. The current Message
   * contract (domain/conversation.ts) only carries `mediaUri`/`mediaType`,
   * so this is undefined today — mapped here so the tile renders a real
   * thumbnail the moment a poster field is added upstream, instead of
   * regressing to a placeholder play-icon tile (AGENTS.md §4).
   */
  thumbnailUri?: string;
};

type Filter = 'all' | 'photos' | 'videos';

export default function SharedConversationMediaScreen({ navigation, route }: Props) {
  const { conversationId } = route.params as { conversationId: string };
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { t } = useAppTranslation('messaging');
  const thumbSize = (width - Space.md * 2 - GAP * (COLS - 1)) / COLS;

  const styles = useMemo(() => createStyles(colors), [colors]);

  const conversations = useStore((state) => state.conversations);
  const replaceConversationMessages = useStore((state) => state.replaceConversationMessages);
  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const [filter, setFilter] = useState<Filter>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
        thumbnailUri: undefined as string | undefined }));
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
      timestamp: item.timestamp });
  };

  const enterSelectionMode = (item: MediaItem) => {
    haptic.medium();
    setSelectionMode(true);
    setSelectedIds(new Set([item.id]));
  };

  const toggleSelection = (item: MediaItem) => {
    haptic.selection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
  };

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleDelete = () => {
    if (selectedIds.size === 0 || !conversation) return;
    haptic.heavy();
    const remaining = conversation.messages.filter(
      (m) => !selectedIds.has(m.id)
    );
    replaceConversationMessages(conversationId, remaining);
    exitSelectionMode();
  };

  // Exit selection mode on back when active
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (selectionMode) {
        e.preventDefault();
        exitSelectionMode();
      }
    });
    return unsubscribe;
  }, [navigation, selectionMode, exitSelectionMode]);

  const subtitle =
    allMedia.length > 0
      ? t('sharedMedia.summary', { photoCount: photos.length, photoPlural: photos.length === 1 ? '' : 's', videoCount: videos.length, videoPlural: videos.length === 1 ? '' : 's' })
      : undefined;

  const renderItem = ({ item }: { item: MediaItem }) => {
    const selected = selectedIds.has(item.id);
    return (
      <AnimatedPressable
        style={[
          styles.thumbWrap,
          { width: thumbSize, height: thumbSize },
          selectionMode && selected && styles.thumbSelected,
        ]}
        onPress={() =>
          selectionMode ? toggleSelection(item) : handlePress(item)
        }
        onLongPress={() =>
          selectionMode ? undefined : enterSelectionMode(item)
        }
        activeOpacity={0.85}
        scaleValue={0.96}
        hapticFeedback="light"
        accessibilityLabel={
          selectionMode
            ? `${selected ? 'Deselect' : 'Select'} ${item.isVideo ? 'video' : 'photo'}`
            : item.isVideo
              ? 'View shared video'
              : 'View shared photo'
        }
        accessibilityHint={
          selectionMode ? 'Double tap to toggle selection' : undefined
        }
        accessibilityRole="button"
        accessibilityState={selectionMode ? { selected } : undefined}
      >
        {item.isVideo ? (
          <View style={[styles.thumb, styles.videoTile, { width: thumbSize, height: thumbSize }]}>
            {item.thumbnailUri ? (
              <ExpoImage
                source={{ uri: item.thumbnailUri }}
                style={[styles.thumb, { width: thumbSize, height: thumbSize }]}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={item.thumbnailUri}
                accessibilityLabel={t('sharedMedia.videoThumbnail')}
              />
            ) : null}
          </View>
        ) : (
          <CachedImage
            uri={item.mediaUri}
            style={[styles.thumb, { width: thumbSize, height: thumbSize }]}
            contentFit="cover"
          />
        )}
        {item.isVideo && !selectionMode && (
          <View style={styles.videoBadge}>
            <Ionicons name="play" size={VIDEO_PLAY_ICON} color={colors.scrimTextPrimary} />
          </View>
        )}
        {selectionMode && (
          <View style={styles.checkOverlay}>
            <View
              style={[
                styles.checkCircle,
                selected
                  ? styles.checkCircleFilled
                  : styles.checkCircleEmpty,
              ]}
            >
              {selected && (
                <Ionicons
                  name="checkmark"
                  size={14}
                  color={colors.textInverse}
                />
              )}
            </View>
          </View>
        )}
      </AnimatedPressable>
    );
  };

  const selectionHeader = (
    <FlagshipHeader
      title={t('sharedMedia.selectedCount', { count: selectedIds.size })}
      onBack={exitSelectionMode}
      backIcon="close"
      rightAction={
        <AnimatedPressable
          onPress={handleDelete}
          disabled={selectedIds.size === 0}
          style={styles.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel={t('sharedMedia.deleteSelected')}
          accessibilityHint={t('sharedMedia.removeSelectedHint', { count: selectedIds.size, plural: selectedIds.size === 1 ? '' : 's' })}
          scaleValue={0.96}
          hapticFeedback="medium"
          activeOpacity={0.7}
        >
          <Ionicons
            name="trash-outline"
            size={Control.icon}
            color={selectedIds.size === 0 ? colors.textMuted : colors.danger}
          />
        </AnimatedPressable>
      }
    />
  );

  return (
    <FlagshipScreen
      header={
        selectionMode ? (
          selectionHeader
        ) : (
          <FlagshipHeader
            title={t('sharedMedia.title')}
            subtitle={subtitle}
            onBack={() => navigation.goBack()}
          />
        )
      }
      scrollEnabled={false}
    >
      {showFilter && !selectionMode && (
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
                accessibilityLabel={t('sharedMedia.filter', { label })}
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

      {filteredMedia.length === 0 ? (
        <EmptyState
          icon="images-outline"
          title={t('sharedMedia.noMedia')}
          subtitle={t('sharedMedia.noMediaSubtitle')}
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
      paddingBottom: Space.xxl },
    filterRow: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm },
    filterChip: {
      minHeight: Control.chrome,
      paddingHorizontal: Space.md,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center' },
    filterChipActive: {
      backgroundColor: colors.textPrimary,
      borderColor: colors.textPrimary },
    filterText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      color: colors.textSecondary },
    filterTextActive: {
      color: colors.textInverse },
    thumbWrap: {
      borderRadius: Radius.sm,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      marginRight: GAP,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border },
    thumbSelected: {
      borderColor: colors.brand,
      borderWidth: Stroke.emphasis,
      opacity: 0.7 },
    thumb: {
      borderRadius: Radius.sm },
    videoTile: {
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center' },
    videoBadge: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginTop: -VIDEO_PLAY_BADGE / 2,
      marginLeft: -VIDEO_PLAY_BADGE / 2,
      width: VIDEO_PLAY_BADGE,
      height: VIDEO_PLAY_BADGE,
      borderRadius: Radius.full,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center' },
    checkOverlay: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      width: CHECK_SIZE,
      height: CHECK_SIZE,
      justifyContent: 'center',
      alignItems: 'center' },
    checkCircle: {
      width: CHECK_SIZE,
      height: CHECK_SIZE,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: Stroke.standard },
    checkCircleEmpty: {
      backgroundColor: colors.overlay,
      borderColor: colors.scrimTextPrimary },
    checkCircleFilled: {
      backgroundColor: colors.brand,
      borderColor: colors.brand },
    deleteBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' } });
}
