import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  ActivityIndicator,
  GestureResponderEvent,
  PanResponder,
  ScrollView,
  ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CachedImage } from '../CachedImage';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  Stroke,
  Control,
  ThumbSize } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { makeStableId } from '../../utils/createStableId';
import { useToast } from '../../context/ToastContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { isVideoUri } from '../../utils/media';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring } from 'react-native-reanimated';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { REDUCED_SPRING } from '../../theme/motionTokens';

export interface OutfitTag {
  id: string;
  label: string;
  listingId?: string;
  x: number;
  y: number;
}

export interface LookMediaItem {
  id: string;
  uri: string;
  isVideo: boolean;
}

export interface LookMediaComposerProps {
  /** Single image mode (legacy) — when provided, `items` is ignored */
  imageUri: string | null;
  onImageChange: (uri: string | null) => void;
  /** Multi-image mode (carousel) — when provided, takes precedence over imageUri */
  items?: LookMediaItem[];
  onItemsChange?: (items: LookMediaItem[]) => void;
  tags: OutfitTag[];
  onTagsChange: (tags: OutfitTag[]) => void;
  editable: boolean;
  /** Max carousel slides (default 10) */
  maxItems?: number;
}

const DEFAULT_MAX_ITEMS = 10;

function uriToItem(uri: string): LookMediaItem {
  return {
    id: makeStableId('media', 8),
    uri,
    isVideo: isVideoUri(uri) };
}

export function LookMediaComposer({
  imageUri,
  onImageChange,
  items,
  onItemsChange,
  tags,
  onTagsChange,
  editable,
  maxItems = DEFAULT_MAX_ITEMS }: LookMediaComposerProps) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const haptic = useHaptic();
  const { show } = useToast();
  const reducedMotion = useReducedMotion();
  const [isPicking, setIsPicking] = useState(false);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const layoutRef = useRef<{ width: number; height: number } | null>(null);

  // Multi-image mode takes precedence when both items and onItemsChange are
  // provided. Legacy single-image callers keep working via imageUri.
  const multiMode = !!(items && onItemsChange);
  const safeItems = items ?? [];
  const maxItemsClamped = Math.max(1, maxItems);

  // The currently displayed URI — the active carousel slide in multi mode,
  // or the legacy single image otherwise.
  const activeUri = multiMode
    ? safeItems[activeIndex]?.uri ?? null
    : imageUri;

  // Keep activeIndex in range when the items array shrinks.
  React.useEffect(() => {
    if (!multiMode) return;
    if (activeIndex > safeItems.length - 1) {
      setActiveIndex(Math.max(0, safeItems.length - 1));
    }
  }, [multiMode, safeItems.length, activeIndex]);

  const handlePickImage = useCallback(
    async (
      source: 'gallery' | 'camera',
      mode: 'add' | 'replace' = 'add'
    ) => {
      if (isPicking) return;
      if (multiMode && mode === 'add' && safeItems.length >= maxItemsClamped) {
        show(`You can add up to ${maxItemsClamped} photos`, 'error');
        return;
      }
      setIsPicking(true);
      try {
        if (source === 'gallery') {
          const permission =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            show('Allow photo library access', 'error');
            return;
          }
          if (multiMode) {
            const remaining = maxItemsClamped - safeItems.length;
            if (mode === 'replace') {
              // Single-selection replace of the active slide.
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                allowsEditing: true,
                aspect: [4, 5],
                quality: 0.92 });
              if (!result.canceled && result.assets?.[0]?.uri) {
                const next = safeItems.map((it, i) =>
                  i === activeIndex ? uriToItem(result.assets[0].uri) : it
                );
                onItemsChange!(next);
                haptic.light();
              }
            } else {
              // Multi-selection add. selectionLimit is the remaining capacity.
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                allowsMultipleSelection: true,
                selectionLimit: Math.max(1, remaining),
                quality: 0.92 });
              if (!result.canceled && result.assets?.length) {
                const picked = result.assets
                  .filter((a) => !!a.uri)
                  .map((a) => uriToItem(a.uri));
                if (picked.length) {
                  const next = [...safeItems, ...picked].slice(
                    0,
                    maxItemsClamped
                  );
                  onItemsChange!(next);
                  haptic.light();
                }
              }
            }
          } else {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 5],
              quality: 0.92 });
            if (!result.canceled && result.assets?.[0]?.uri) {
              onImageChange(result.assets[0].uri);
              haptic.light();
            }
          }
        } else {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            show('Allow camera access', 'error');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: multiMode
              ? ImagePicker.MediaTypeOptions.All
              : ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 5],
            quality: 0.92 });
          if (!result.canceled && result.assets?.[0]?.uri) {
            if (multiMode) {
              if (mode === 'replace') {
                const next = safeItems.map((it, i) =>
                  i === activeIndex ? uriToItem(result.assets[0].uri) : it
                );
                onItemsChange!(next);
              } else if (safeItems.length < maxItemsClamped) {
                onItemsChange!([...safeItems, uriToItem(result.assets[0].uri)]);
              }
            } else {
              onImageChange(result.assets[0].uri);
            }
            haptic.light();
          }
        }
      } catch {
        show('Failed to pick image', 'error');
      } finally {
        setIsPicking(false);
      }
    },
    [
      isPicking,
      multiMode,
      safeItems,
      maxItemsClamped,
      activeIndex,
      onItemsChange,
      onImageChange,
      haptic,
      show,
    ]
  );

  const handleRemoveItem = useCallback(
    (index: number) => {
      if (!multiMode || !onItemsChange) return;
      const next = safeItems.filter((_, i) => i !== index);
      onItemsChange(next);
      haptic.medium();
      if (activeIndex >= next.length) {
        setActiveIndex(Math.max(0, next.length - 1));
      }
    },
    [multiMode, onItemsChange, safeItems, activeIndex, haptic]
  );

  const handleReorder = useCallback(
    (from: number, to: number) => {
      if (!multiMode || !onItemsChange || from === to) return;
      const next = [...safeItems];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onItemsChange(next);
      setActiveIndex(to);
      haptic.selection();
    },
    [multiMode, onItemsChange, safeItems, haptic]
  );

  const handlePhotoPress = useCallback(
    (evt: GestureResponderEvent) => {
      if (!activeUri || !editable || !layoutRef.current) return;
      const { locationX, locationY } = evt.nativeEvent;
      const { width, height } = layoutRef.current;
      const x = Math.min(Math.max(locationX / width, 0.05), 0.95);
      const y = Math.min(Math.max(locationY / height, 0.05), 0.95);
      const tagId = makeStableId('tag', 6);
      onTagsChange([...tags, { id: tagId, label: '', x, y }]);
      setActiveTagId(tagId);
      haptic.light();
    },
    [activeUri, editable, tags, onTagsChange, haptic]
  );

  const handleTagLabelChange = useCallback(
    (tagId: string, label: string) => {
      onTagsChange(tags.map((t) => (t.id === tagId ? { ...t, label } : t)));
    },
    [tags, onTagsChange]
  );

  const handleTagRemove = useCallback(
    (tagId: string) => {
      onTagsChange(tags.filter((t) => t.id !== tagId));
      if (activeTagId === tagId) setActiveTagId(null);
    },
    [tags, onTagsChange, activeTagId]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderRelease: (_evt, _gestureState) => {} })
  ).current;

  // ── Empty state ────────────────────────────────────────────────────────
  if (!activeUri) {
    return (
      <View style={styles.placeholderWrap}>
        <Pressable
          style={styles.placeholderBtn}
          onPress={() => handlePickImage('gallery', 'add')}
          accessibilityRole="button"
          accessibilityLabel="Choose photo from gallery"
        >
          {isPicking ? (
            <ActivityIndicator size="large" color={colors.brand} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
              <Text style={styles.placeholderTitle}>Add your outfit photo</Text>
              <Text style={styles.placeholderSubtitle}>
                {multiMode
                  ? `Add up to ${maxItemsClamped} photos`
                  : 'Tap to choose from gallery or camera'}
              </Text>
            </>
          )}
        </Pressable>
        <View style={styles.sourceRow}>
          <Pressable
            style={styles.sourceBtn}
            onPress={() => handlePickImage('gallery', 'add')}
            accessibilityRole="button"
            accessibilityLabel="Pick from gallery"
          >
            <Ionicons name="images-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.sourceBtnText}>Gallery</Text>
          </Pressable>
          <Pressable
            style={styles.sourceBtn}
            onPress={() => handlePickImage('camera', 'add')}
            accessibilityRole="button"
            accessibilityLabel="Take a photo"
          >
            <Ionicons name="camera-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.sourceBtnText}>Camera</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View
        style={styles.imageWrap}
        onLayout={(e) => {
          layoutRef.current = {
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height };
        }}
        {...panResponder.panHandlers}
      >
        <Pressable onPress={handlePhotoPress} style={StyleSheet.absoluteFill} accessibilityRole="button">
          <CachedImage uri={activeUri} style={styles.image} contentFit="cover" />
        </Pressable>

        {tags.map((tag) => {
          const isActive = activeTagId === tag.id;
          return (
            <View
              key={tag.id}
              style={[styles.tagWrap, { left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }]}
            >
              <Pressable
                hitSlop={20}
                onPress={() => {
                  if (!editable) return;
                  setActiveTagId(isActive ? null : tag.id);
                  haptic.light();
                }}
                accessibilityRole="switch"
              >
                <View style={[styles.tagDot, isActive && styles.tagDotActive]} />
              </Pressable>
              {isActive && editable && (
                <View style={styles.tagEditor}>
                  <Text style={styles.tagEditorLabel}>Label</Text>
                  <Text style={styles.tagEditorHint}>Tap to toggle</Text>
                  <Pressable
                    style={styles.tagRemoveBtn}
                    hitSlop={8}
                    onPress={() => handleTagRemove(tag.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove tag"
                  >
                    <Ionicons name="close-circle" size={20} color={colors.danger} />
                  </Pressable>
                </View>
              )}
              {tag.label && !isActive && (
                <View style={styles.tagPill}>
                  <Text style={styles.tagPillText} numberOfLines={1}>{tag.label}</Text>
                </View>
              )}
            </View>
          );
        })}

        {editable && (
          <Pressable
            style={styles.changePhotoBtn}
            hitSlop={8}
            onPress={() => handlePickImage('gallery', multiMode ? 'replace' : 'add')}
            accessibilityRole="button"
            accessibilityLabel="Change photo"
          >
            <Ionicons name="swap-horizontal" size={16} color={colors.scrimTextPrimary} />
            <Text style={styles.changePhotoText}>Change</Text>
          </Pressable>
        )}

        {editable && tags.length === 0 && (
          <View style={styles.tapHint}>
            <Text style={styles.tapHintText}>Tap on the photo to tag a piece</Text>
          </View>
        )}
      </View>

      {multiMode && safeItems.length > 0 && (
        <ThumbnailStrip
          items={safeItems}
          activeIndex={activeIndex}
          maxItems={maxItemsClamped}
          editable={editable}
          reducedMotion={reducedMotion}
          onSelect={(i) => {
            setActiveIndex(i);
            haptic.selection();
          }}
          onRemove={handleRemoveItem}
          onReorder={handleReorder}
          onAdd={() => handlePickImage('gallery', 'add')}
        />
      )}
    </View>
  );
}

// ── Thumbnail strip (carousel selection / reorder) ─────────────────────────

const THUMB_SIZE = ThumbSize.sm; // 64
const THUMB_GAP = Space.sm; // 8

interface ThumbnailStripProps {
  items: LookMediaItem[];
  activeIndex: number;
  maxItems: number;
  editable: boolean;
  reducedMotion: boolean;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: () => void;
}

function ThumbnailStrip({
  items,
  activeIndex,
  maxItems,
  editable,
  reducedMotion,
  onSelect,
  onRemove,
  onReorder,
  onAdd }: ThumbnailStripProps) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [reorderIndex, setReorderIndex] = useState<number | null>(null);

  const moveItem = useCallback(
    (from: number, dir: -1 | 1) => {
      const to = from + dir;
      if (to < 0 || to >= items.length) return;
      onReorder(from, to);
      setReorderIndex(null);
    },
    [items.length, onReorder]
  );

  return (
    <View style={styles.stripWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripContent}
      >
        {items.map((item, index) => (
          <ThumbItem
            key={item.id}
            item={item}
            index={index}
            total={items.length}
            isActive={index === activeIndex}
            editable={editable}
            reducedMotion={reducedMotion}
            reorderOpen={reorderIndex === index}
            onSelect={() => onSelect(index)}
            onRemove={() => onRemove(index)}
            onReorder={onReorder}
            onLongPress={() => setReorderIndex(reorderIndex === index ? null : index)}
            onMove={(dir) => moveItem(index, dir)}
          />
        ))}

        {editable && items.length < maxItems && (
          <Pressable
            style={styles.addTile}
            hitSlop={4}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel="Add more photos"
          >
            <Ionicons name="add" size={24} color={colors.textSecondary} />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

interface ThumbItemProps {
  item: LookMediaItem;
  index: number;
  total: number;
  isActive: boolean;
  editable: boolean;
  reducedMotion: boolean;
  reorderOpen: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onReorder: (from: number, to: number) => void;
  onLongPress: () => void;
  onMove: (dir: -1 | 1) => void;
}

function ThumbItem({
  item,
  index,
  total,
  isActive,
  editable,
  reducedMotion,
  reorderOpen,
  onSelect,
  onRemove,
  onReorder,
  onLongPress,
  onMove }: ThumbItemProps) {
  const { colors } = useAppTheme();
  const { spring } = useMotionConfig();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const isDragging = useSharedValue(false);
  const translateX = useSharedValue(0);
  const lift = useSharedValue(0);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(editable && !reducedMotion)
        .onStart(() => {
          isDragging.value = true;
          lift.value = withSpring(1, reducedMotion ? REDUCED_SPRING : spring.lift);
        })
        .onUpdate((e) => {
          translateX.value = e.translationX;
        })
        .onEnd((e) => {
          const delta = Math.round(e.translationX / (THUMB_SIZE + THUMB_GAP));
          const to = Math.max(0, Math.min(total - 1, index + delta));
          isDragging.value = false;
          lift.value = withSpring(0, reducedMotion ? REDUCED_SPRING : spring.lift);
          translateX.value = withSpring(0, reducedMotion ? REDUCED_SPRING : spring.settle);
          if (to !== index) {
            runOnJS(onReorder)(index, to);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, reducedMotion, index, total]
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(editable)
        .onEnd(() => {
          runOnJS(onSelect)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable]
  );

  const composed = useMemo(
    () => Gesture.Exclusive(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  const dragStyle = useAnimatedStyle(() => {
    const s = lift.value;
    const style: ViewStyle = {
      transform: [
        { translateX: translateX.value },
        { scale: 1 + s * 0.08 },
      ],
      zIndex: isDragging.value ? 100 : 1 };
    if (isDragging.value) {
      style.shadowColor = colors.shadow;
      style.shadowOpacity = 0.3;
      style.shadowRadius = 14;
      style.shadowOffset = { width: 0, height: 6 };
      style.elevation = 8;
    }
    return style;
  });

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View
        style={[
          styles.thumbWrap,
          isActive && styles.thumbWrapActive,
          dragStyle,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Photo ${index + 1} of ${total}`}
        onAccessibilityAction={(e) => {
          const action = (e.nativeEvent as { actionName?: string }).actionName;
          if (action === 'remove') onRemove();
          else if (action === 'activate') onSelect();
        }}
        accessibilityActions={[
          { name: 'activate', label: 'Set as active photo' },
          { name: 'remove', label: 'Remove photo' },
        ]}
      >
        <Pressable
          accessible={false}
          onLongPress={reducedMotion && editable ? onLongPress : undefined}
          style={StyleSheet.absoluteFill}
        >
          <CachedImage
            uri={item.uri}
            style={styles.thumbImage}
            contentFit="cover"
          />
          {item.isVideo && (
            <View style={styles.videoBadge}>
              <Ionicons name="videocam" size={11} color={colors.scrimTextPrimary} />
            </View>
          )}
        </Pressable>

        {editable && (
          <Pressable
            style={styles.thumbRemove}
            hitSlop={8}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove photo ${index + 1}`}
          >
            <Ionicons name="close" size={14} color={colors.scrimTextPrimary} />
          </Pressable>
        )}

        {reducedMotion && reorderOpen && editable && (
          <View style={styles.reorderArrowRow}>
            <Pressable
              style={styles.reorderArrowBtn}
              hitSlop={6}
              disabled={index === 0}
              onPress={() => onMove(-1)}
              accessibilityRole="button"
              accessibilityLabel="Move photo earlier"
            >
              <Ionicons name="chevron-back" size={16} color={colors.scrimTextPrimary} />
            </Pressable>
            <Pressable
              style={styles.reorderArrowBtn}
              hitSlop={6}
              disabled={index === total - 1}
              onPress={() => onMove(1)}
              accessibilityRole="button"
              accessibilityLabel="Move photo later"
            >
              <Ionicons name="chevron-forward" size={16} color={colors.scrimTextPrimary} />
            </Pressable>
          </View>
        )}
      </Reanimated.View>
    </GestureDetector>
  );
}

const createStyles = (colors: ThemeColors, screenWidth: number) => {
  const imageHeight = screenWidth * 1.25;
  return StyleSheet.create({
  placeholderWrap: {
    width: screenWidth,
    height: imageHeight,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md },
  placeholderBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    padding: Space.xl },
  placeholderTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textSecondary },
  placeholderSubtitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textMuted },
  sourceRow: {
    flexDirection: 'row',
    gap: Space.md },
  sourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  sourceBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary },
  imageWrap: {
    width: screenWidth,
    height: imageHeight,
    position: 'relative',
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden' },
  image: {
    width: '100%',
    height: '100%' },
  tagWrap: {
    position: 'absolute',
    width: 44,
    height: 44,
    marginLeft: -22,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3 },
  tagDot: {
    width: 14,
    height: 14,
    borderRadius: Radius.md,
    backgroundColor: colors.scrimTextPrimary,
    borderWidth: Stroke.standard,
    borderColor: colors.overlay },
  tagDotActive: {
    backgroundColor: colors.brand,
    borderColor: colors.scrimTextPrimary,
    width: 18,
    height: 18,
    borderRadius: Radius.lg },
  tagPill: {
    position: 'absolute',
    top: 24,
    backgroundColor: colors.overlay,
    borderRadius: Radius.lg,
    paddingHorizontal: 10,
    paddingVertical: Space.xs,
    maxWidth: 120 },
  tagPillText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  tagEditor: {
    position: 'absolute',
    top: 26,
    backgroundColor: colors.overlay,
    borderRadius: Radius.lg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
    minWidth: 100 },
  tagEditorLabel: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  tagEditorHint: {
    color: colors.scrimTextSecondary,
    fontSize: 10,
    fontFamily: TypographyV2.meta.fontFamily },
  tagRemoveBtn: {
    position: 'absolute',
    top: -8,
    right: -8 },
  changePhotoBtn: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5 },
  changePhotoText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  tapHint: {
    position: 'absolute',
    bottom: Space.sm,
    left: Space.sm,
    backgroundColor: colors.overlay,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5 },
  tapHintText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  // ── Thumbnail strip ──
  stripWrap: {
    width: screenWidth,
    paddingVertical: Space.sm },
  stripContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THUMB_GAP,
    paddingHorizontal: Space.md },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    overflow: 'visible',
    position: 'relative' },
  thumbWrapActive: {
    borderColor: colors.brand,
    borderWidth: Stroke.emphasis },
  thumbImage: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.md },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  addTile: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface },
  reorderArrowRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    backgroundColor: colors.overlay,
    borderRadius: Radius.md },
  reorderArrowBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' } });
};
