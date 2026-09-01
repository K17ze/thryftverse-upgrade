import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  ActivityIndicator,
  FlatList,
  ScrollView,
  useWindowDimensions,
  AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control, Stroke, Elevation } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useHaptic } from '../hooks/useHaptic';
import { CachedImage } from '../components/CachedImage';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { makeStableId } from '../utils/createStableId';
import {
  fetchPosterStoryArchive,
  createPosterHighlight,
  type PosterStory } from '../services/postersApi';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePosterHighlight'>;

const NUM_COLS = 3;
const COVER_PREVIEW_W = 120;
const COVER_THUMB_W = 52;

export default function CreatePosterHighlightScreen({ navigation, route }: Props) {
  const { colors, isDark } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();
  const THUMB_SIZE = (SCREEN_W - Space.md * 2 - Space.sm * (NUM_COLS - 1)) / NUM_COLS;
  const styles = React.useMemo(() => createStyles(colors, THUMB_SIZE), [colors, THUMB_SIZE]);
  const { show } = useToast();
  const haptic = useHaptic();
  const currentUser = useStore((state) => state.currentUser);

  const [title, setTitle] = React.useState('');
  const [stories, setStories] = React.useState<PosterStory[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  // Selected frame IDs — maps storyId-frameIndex to frameId
  const [selectedFrames, setSelectedFrames] = React.useState<Map<string, string>>(new Map());
  // Cover frame ID — defaults to the first selected frame, can be changed independently
  const [coverFrameId, setCoverFrameId] = React.useState<string | null>(null);
  const [isTitleFocused, setIsTitleFocused] = React.useState(false);
  // Stable highlight id generated once per session so a create retry reuses
  // the same id (idempotency) instead of creating a duplicate highlight.
  const highlightIdRef = React.useRef<string>(makeStableId('hl'));

  // Load all archived stories to pick frames from
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetchPosterStoryArchive({ includeActive: true });
        setStories(res.items);
      } catch {
        show('Could not load stories', 'error');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [show]);

  // Flatten all frames from all stories into a selectable list
  const allFrames = React.useMemo(() => {
    const frames: Array<{
      key: string;
      frameId: string;
      mediaUrl: string | null;
      caption: string;
      mediaType: string;
      backgroundColor: string | null;
      storyId: string;
      storyCreatedAt: string;
    }> = [];
    for (const story of stories) {
      for (const frame of story.frames) {
        frames.push({
          key: `${story.id}-${frame.id}`,
          frameId: frame.id,
          mediaUrl: frame.mediaUrl,
          caption: frame.caption || '',
          mediaType: frame.mediaType,
          backgroundColor: frame.backgroundColor,
          storyId: story.id,
          storyCreatedAt: story.createdAt });
      }
    }
    return frames;
  }, [stories]);

  // Selected frame objects in selection order — used by the cover selector
  const selectedFrameList = React.useMemo(() => {
    return Array.from(selectedFrames.keys())
      .map((key) => allFrames.find((f) => f.key === key))
      .filter((f): f is NonNullable<typeof f> => f !== undefined);
  }, [selectedFrames, allFrames]);

  const toggleFrame = (key: string, frameId: string) => {
    haptic.selection();
    setSelectedFrames((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
        // If the removed frame was the cover, pick a new cover from remaining frames
        setCoverFrameId((currCover) => {
          if (currCover === frameId) {
            const remaining = Array.from(next.values());
            return remaining.length > 0 ? remaining[0] : null;
          }
          return currCover;
        });
        AccessibilityInfo.announceForAccessibility(`Frame deselected, ${next.size} total selected`);
      } else {
        next.set(key, frameId);
        // If this is the first selected frame, set it as the cover
        setCoverFrameId((currCover) => currCover ?? frameId);
        AccessibilityInfo.announceForAccessibility(`Frame selected, ${next.size} total selected`);
      }
      return next;
    });
  };

  // Set a specific selected frame as the cover
  const setCover = (frameId: string) => {
    // Only allow setting cover from selected frames
    if (Array.from(selectedFrames.values()).includes(frameId)) {
      haptic.light();
      setCoverFrameId(frameId);
      AccessibilityInfo.announceForAccessibility('Cover image set');
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      show('Give your highlight a name', 'error');
      return;
    }
    if (selectedFrames.size === 0) {
      show('Select at least one frame', 'error');
      return;
    }
    if (!currentUser) {
      show('Sign in to create highlights', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const highlightId = highlightIdRef.current;
      const frameIds = Array.from(selectedFrames.values());
      // Use the user-selected cover frame (falls back to first selected frame)
      const resolvedCoverFrameId = coverFrameId ?? frameIds[0];

      await createPosterHighlight({
        id: highlightId,
        title: title.trim(),
        coverFrameId: resolvedCoverFrameId,
        frameIds });

      haptic.success();
      AccessibilityInfo.announceForAccessibility('Highlight created');
      show('Highlight created', 'success');
      navigation.goBack();
    } catch {
      haptic.error();
      show('Failed to create highlight', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const renderFrame = ({ item }: { item: typeof allFrames[0] }) => {
    const isSelected = selectedFrames.has(item.key);
    const isCover = coverFrameId === item.frameId;
    return (
      <AnimatedPressable
        onPress={() => toggleFrame(item.key, item.frameId)}
        onLongPress={() => {
          if (isSelected && !isCover) {
            haptic.medium();
            setCover(item.frameId);
          }
        }}
        delayLongPress={300}
        style={styles.thumbWrap}
        scaleValue={0.97}
        hapticFeedback="light"
        activeOpacity={0.85}
        accessibilityLabel={`${isSelected ? 'Deselect' : 'Select'} frame${item.caption ? `: ${item.caption}` : ''}${isCover ? ', cover' : ''}`}
        accessibilityHint="Selects this frame for the highlight. Long-press to set as cover."
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
      >
        <View style={[styles.thumb, isSelected && styles.thumbSelected, isCover && styles.thumbCover]}>
          {item.mediaUrl ? (
            <CachedImage
              uri={item.mediaUrl}
              style={styles.thumbImage}
              contentFit="cover"
              containerStyle={{ borderRadius: Radius.md, overflow: 'hidden' }}
            />
          ) : (
            <View style={[styles.thumbImage, { backgroundColor: item.backgroundColor || colors.surfaceAlt }]}>
              <Text style={styles.thumbPlaceholder} numberOfLines={3}>{item.caption || 'Text'}</Text>
            </View>
          )}
          {isSelected && !isCover && (
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={16} color={colors.textInverse} />
            </View>
          )}
          {isCover && (
            <View style={styles.coverBadge}>
              <Ionicons name="image-outline" size={12} color={colors.textInverse} />
              <Text style={styles.coverBadgeText}>Cover</Text>
            </View>
          )}
        </View>
      </AnimatedPressable>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.topBar}>
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            style={styles.iconBtn}
            activeOpacity={0.7}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityLabel="Close"
            accessibilityHint="Closes the highlight creator"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.topTitle}>New Highlight</Text>
          <View style={styles.iconBtn} />
        </View>
        {/* Skeleton title input */}
        <View style={styles.titleSection}>
          <SkeletonLoader width="70%" height={Control.hit} borderRadius={Radius.lg} />
          <SkeletonLoader width={32} height={TypographyV2.meta.size} borderRadius={Radius.sm} />
        </View>
        {/* Skeleton grid of thumbnails */}
        <View style={styles.gridContent}>
          <View style={styles.skeletonGrid}>
            {Array.from({ length: 9 }, (_, i) => (
              <SkeletonLoader key={i} width={THUMB_SIZE} height={THUMB_SIZE} borderRadius={Radius.md} />
            ))}
          </View>
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
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityLabel="Close"
          accessibilityHint="Closes the highlight creator"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.topTitle}>New Highlight</Text>
        <AnimatedPressable
          onPress={handleCreate}
          style={[styles.saveBtn, (!title.trim() || selectedFrames.size === 0 || isSaving) && styles.saveBtnDisabled]}
          activeOpacity={0.7}
          scaleValue={0.97}
          hapticFeedback="medium"
          disabled={!title.trim() || selectedFrames.size === 0 || isSaving}
          accessibilityLabel="Create highlight"
          accessibilityHint="Creates the highlight from selected frames"
          accessibilityRole="button"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.saveBtnText}>Create</Text>
          )}
        </AnimatedPressable>
      </View>

      {/* Title input */}
      <View style={styles.titleSection}>
        <TextInput
          style={[styles.titleInput, isTitleFocused && styles.titleInputFocused]}
          placeholder="Highlight name"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          maxLength={40}
          onFocus={() => setIsTitleFocused(true)}
          onBlur={() => setIsTitleFocused(false)}
          accessibilityLabel="Highlight title"
          accessibilityHint="Enter a title for your highlight"
        />
        <Text style={styles.titleCount}>{title.length}/40</Text>
      </View>

      {/* Cover preview — shows the selected cover frame.
          Tap a thumbnail in the horizontal strip below to change the cover.
          Long-press a selected frame in the grid as a shortcut. */}
      {coverFrameId && (() => {
        const coverFrame = allFrames.find((f) => f.frameId === coverFrameId);
        if (!coverFrame) return null;
        return (
          <View style={styles.coverSection}>
            <Text style={styles.coverSectionLabel}>Cover</Text>
            <View style={styles.coverPreviewWrap}>
              <View style={styles.coverPreview}>
                {coverFrame.mediaUrl ? (
                  <CachedImage
                    uri={coverFrame.mediaUrl}
                    style={styles.coverPreviewImage}
                    contentFit="cover"
                    containerStyle={{ borderRadius: Radius.md, overflow: 'hidden' }}
                  />
                ) : (
                  <View style={[styles.coverPreviewImage, { backgroundColor: coverFrame.backgroundColor || colors.surfaceAlt }]}>
                    <Text style={styles.thumbPlaceholder} numberOfLines={2}>{coverFrame.caption || 'Text'}</Text>
                  </View>
                )}
                <View style={styles.coverPreviewBadge}>
                  <Ionicons name="image-outline" size={12} color={colors.textInverse} />
                  <Text style={styles.coverPreviewBadgeText}>Cover</Text>
                </View>
              </View>
            </View>
            {selectedFrameList.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.coverSelector}
                accessibilityRole="list"
                accessibilityLabel="Cover selector — choose a frame for the cover"
              >
                {selectedFrameList.map((frame) => {
                  const isCover = coverFrameId === frame.frameId;
                  return (
                    <AnimatedPressable
                      key={frame.key}
                      onPress={() => setCover(frame.frameId)}
                      style={[styles.coverThumbWrap, isCover && styles.coverThumbActive]}
                      scaleValue={0.94}
                      hapticFeedback="light"
                      accessibilityLabel={`Set cover to this frame${isCover ? ', current cover' : ''}`}
                      accessibilityHint="Sets this frame as the highlight cover"
                      accessibilityRole="button"
                      accessibilityState={{ selected: isCover }}
                    >
                      {frame.mediaUrl ? (
                        <CachedImage
                          uri={frame.mediaUrl}
                          style={styles.coverThumb}
                          contentFit="cover"
                          containerStyle={{ borderRadius: Radius.sm, overflow: 'hidden' }}
                        />
                      ) : (
                        <View style={[styles.coverThumb, { backgroundColor: frame.backgroundColor || colors.surfaceAlt }]}>
                          <Text style={styles.coverThumbText} numberOfLines={2}>{frame.caption || 'Text'}</Text>
                        </View>
                      )}
                    </AnimatedPressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        );
      })()}

      {/* Frame count */}
      <Text style={styles.sectionLabel}>
        {selectedFrames.size > 0
          ? `${selectedFrames.size} ${selectedFrames.size === 1 ? 'frame' : 'frames'} selected`
          : 'Tap frames to add them'}
      </Text>

      {/* Frame grid */}
      <FlatList
        data={allFrames}
        keyExtractor={(item) => item.key}
        renderItem={renderFrame}
        numColumns={NUM_COLS}
        contentContainerStyle={styles.gridContent}
        ListEmptyComponent={
          <View style={styles.emptyBody}>
            <Ionicons name="images-outline" size={56} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No stories to select</Text>
            <Text style={styles.emptyHint}>Publish stories first, then create a highlight from them.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors, thumbSize: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.sm,
      paddingVertical: Space.sm + 2 },
    iconBtn: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center' },
    topTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    saveBtn: {
      paddingHorizontal: Space.xl,
      height: Control.hit + 4,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.brand },
    saveBtnDisabled: {
      opacity: 0.4 },
    saveBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textInverse },
    titleSection: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: Space.sm },
    titleInput: {
      flex: 1,
      height: Control.hit,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md,
      backgroundColor: colors.surfaceAlt },
    titleInputFocused: {
      borderColor: colors.brand },
    titleCount: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'] },
    sectionLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm },
    gridContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xxl,
      gap: Space.sm },
    thumbWrap: {
      width: thumbSize,
      marginBottom: Space.sm },
    thumb: {
      width: thumbSize,
      aspectRatio: 9 / 16,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
      position: 'relative' },
    thumbSelected: {
      borderWidth: Stroke.emphasis,
      borderColor: colors.brand,
      shadowColor: colors.brand,
      shadowOpacity: 0.2,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 0 },
      elevation: 2 },
    thumbCover: {
      borderWidth: Stroke.emphasis,
      borderColor: colors.brand },
    thumbImage: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center' },
    thumbPlaceholder: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center',
      padding: Space.xs },
    checkBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 24,
      height: 24,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      borderColor: colors.background,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center' },
    coverBadge: {
      position: 'absolute',
      bottom: 4,
      left: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: Space.sm,
      paddingVertical: 3,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      ...Elevation.modal },
    coverBadgeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textInverse },
    // ── Cover preview section ──────────────────────────────────────────
    coverSection: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm },
    coverSectionLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      paddingBottom: Space.xs },
    coverPreviewWrap: {
      alignItems: 'center',
      paddingVertical: Space.xs },
    coverPreview: {
      position: 'relative' },
    coverPreviewImage: {
      width: COVER_PREVIEW_W,
      aspectRatio: 9 / 16,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center' },
    coverPreviewBadge: {
      position: 'absolute',
      bottom: 6,
      left: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: Space.sm,
      paddingVertical: 3,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      ...Elevation.modal },
    coverPreviewBadgeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textInverse },
    coverSelector: {
      gap: Space.xs,
      paddingVertical: Space.sm,
      alignItems: 'center' },
    coverThumbWrap: {
      width: COVER_THUMB_W,
      aspectRatio: 9 / 16,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      borderColor: 'transparent',
      overflow: 'hidden' },
    coverThumbActive: {
      borderWidth: Stroke.emphasis,
      borderColor: colors.brand },
    coverThumb: {
      width: '100%',
      height: '100%',
      borderRadius: Radius.sm,
      justifyContent: 'center',
      alignItems: 'center' },
    coverThumbText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center',
      padding: 3 },
    skeletonGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm },
    emptyBody: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.xxl,
      gap: Space.sm },
    emptyTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary },
    emptyHint: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: Space.xl } });
}
