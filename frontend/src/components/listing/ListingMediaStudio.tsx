import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type, AspectRatio, Stroke} from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';
import { SortablePhotoStrip } from '../SortablePhotoStrip';
import { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import { UploadQueueItem, UploadQueueItemState } from '../../services/mediaUploadQueue';
import { isVideoUri } from '../../utils/media';
import { Video, ResizeMode } from '../compat/Video';

const THUMB_SIZE = 80;

type ItemStatus = 'draft' | 'pending' | 'preparing' | 'uploading' | 'uploaded' | 'failed' | 'cancelled';

const ACTIVE_STATUSES: ItemStatus[] = ['pending', 'preparing', 'uploading'];

function isActiveStatus(status: ItemStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

const STATUS_PROGRESS: Record<ItemStatus, number> = {
  draft: 0,
  pending: 0.1,
  preparing: 0.3,
  uploading: 0.65,
  uploaded: 1,
  failed: 0,
  cancelled: 0,
};

interface ListingMediaStudioProps {
  items: ListingMediaDraftItem[];
  queueItems: UploadQueueItem[];
  maxCount: number;
  errorText?: string;
  onPickFromLibrary: () => void;
  onPickFromCamera: () => void;
  onReorder: (newOrderedIds: string[]) => void;
  onRemoveItem: (itemId: string) => void;
  onRetryItem: (itemId: string) => void;
  /** Per audit 04 P0: explicit "Set as cover" affordance. Moves item to position 0. */
  onSetCover?: (itemId: string) => void;
  /** Edit-Listing: label for the remove action (default: 'Remove') */
  removeLabel?: string;
  /** Edit-Listing: returns true if the item can be removed (default: true for all) */
  canRemoveItem?: (itemId: string) => boolean;
  /** Edit-Listing: whether drag reorder is enabled (default: true) */
  reorderEnabled?: boolean;
  /** Edit-Listing: optional note shown below the strip when reorder is disabled */
  lockedNote?: string;
}

function getItemStatus(
  item: ListingMediaDraftItem,
  queueItems: UploadQueueItem[]
): ItemStatus {
  const queueItem = queueItems.find((q) => q.id === item.id);
  if (queueItem) {
    return queueItem.state as ItemStatus;
  }
  return item.status as ItemStatus;
}

function getDisplayUri(item: ListingMediaDraftItem): string {
  return item.publicUrl || item.uri;
}

function StatusLabel({ status, color }: { status: ItemStatus; color: string }) {
  switch (status) {
    case 'pending':
      return <Text style={[statusLabelStyles.statusLabelText, { color }]}>Queued</Text>;
    case 'preparing':
      return <Text style={[statusLabelStyles.statusLabelText, { color }]}>Preparing…</Text>;
    case 'uploading':
      return <Text style={[statusLabelStyles.statusLabelText, { color }]}>Uploading…</Text>;
    case 'uploaded':
      return null;
    case 'failed':
      return <Text style={[statusLabelStyles.statusLabelText, { color }]}>Failed</Text>;
    case 'cancelled':
      return <Text style={[statusLabelStyles.statusLabelText, { color }]}>Cancelled</Text>;
    default:
      return null;
  }
}

const statusLabelStyles = StyleSheet.create({
  statusLabelText: {
    fontSize: 9,
    fontFamily: Typography.family.semibold,
  },
});

function UploadProgressOverlay({
  status,
  trackWidth,
  variant,
  reducedMotion,
  colors,
  styles,
}: {
  status: ItemStatus;
  trackWidth: number;
  variant: 'thumb' | 'cover';
  reducedMotion: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const progress = useSharedValue(STATUS_PROGRESS[status]);
  const overlayOpacity = useSharedValue(isActiveStatus(status) ? 1 : 0);
  const barOpacity = useSharedValue(isActiveStatus(status) ? 1 : 0);

  useEffect(() => {
    const active = isActiveStatus(status);
    const target = STATUS_PROGRESS[status];
    progress.value = withTiming(target, {
      duration: reducedMotion ? 0 : Motion.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
    if (active) {
      barOpacity.value = withTiming(1, { duration: reducedMotion ? 0 : Motion.duration.fast });
      if (reducedMotion) {
        overlayOpacity.value = 1;
      } else {
        overlayOpacity.value = 1;
        overlayOpacity.value = withRepeat(
          withTiming(0.7, { duration: Motion.duration.normal }),
          -1,
          true
        );
      }
    } else {
      cancelAnimation(overlayOpacity);
      overlayOpacity.value = withTiming(0, { duration: reducedMotion ? 0 : Motion.duration.fast });
      barOpacity.value = withTiming(0, { duration: reducedMotion ? 0 : Motion.duration.fast });
    }
  }, [status, reducedMotion, progress, overlayOpacity, barOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const fillStyle = useAnimatedStyle(() => ({
    width: trackWidth * progress.value,
    opacity: barOpacity.value,
  }));

  if (!isActiveStatus(status)) return null;

  const pct = Math.round((STATUS_PROGRESS[status] ?? 0) * 100);

  return (
    <Reanimated.View
      style={[variant === 'thumb' ? styles.thumbStatusOverlay : styles.coverStatusOverlay, overlayStyle]}
      pointerEvents="none"
    >
      <View style={variant === 'thumb' ? styles.thumbStatusLabel : styles.coverStatusLabel}>
        <StatusLabel status={status} color={colors.scrimTextPrimary} />
        {variant === 'cover' && (
          <Text style={styles.coverProgressPct}>{pct}%</Text>
        )}
      </View>
      <View style={variant === 'thumb' ? styles.thumbProgressBarTrack : styles.coverProgressBarTrack}>
        <Reanimated.View style={[styles.progressBarFill, fillStyle]} />
      </View>
    </Reanimated.View>
  );
}

function UploadedCheckBadge({
  variant,
  reducedMotion,
  spring,
  colors,
  styles,
}: {
  variant: 'thumb' | 'cover';
  reducedMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const scale = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      scale.value = 1;
    } else {
      scale.value = withSequence(
        withSpring(1.2, spring.success),
        withSpring(1, spring.success)
      );
    }
  }, [reducedMotion, spring, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Reanimated.View
      style={[variant === 'thumb' ? styles.thumbUploadedBadge : styles.coverUploadedBadge, style]}
      pointerEvents="none"
    >
      <Ionicons
        name="checkmark-circle"
        size={variant === 'thumb' ? 16 : 22}
        color={colors.success}
        aria-hidden={true}
      />
    </Reanimated.View>
  );
}

export function ListingMediaStudio({
  items,
  queueItems,
  maxCount,
  errorText,
  onPickFromLibrary,
  onPickFromCamera,
  onReorder,
  onRemoveItem,
  onRetryItem,
  onSetCover,
  removeLabel = 'Remove',
  canRemoveItem,
  reorderEnabled = true,
  lockedNote,
}: ListingMediaStudioProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const { width: screenWidth } = useWindowDimensions();
  const coverHeight = Math.round(screenWidth / AspectRatio.marketplace);
  const styles = React.useMemo(
    () => createStyles(colors, screenWidth, coverHeight),
    [colors, screenWidth, coverHeight],
  );

  const handlePickLibrary = useCallback(() => {
    haptic.light();
    onPickFromLibrary();
  }, [haptic, onPickFromLibrary]);

  const handlePickCamera = useCallback(() => {
    haptic.light();
    onPickFromCamera();
  }, [haptic, onPickFromCamera]);

  const handleRemove = useCallback((itemId: string) => {
    haptic.medium();
    onRemoveItem(itemId);
  }, [haptic, onRemoveItem]);

  const handleReorder = useCallback((newOrderedIds: string[]) => {
    haptic.selection();
    onReorder(newOrderedIds);
  }, [haptic, onReorder]);

  const handleRetry = useCallback((itemId: string) => {
    haptic.light();
    onRetryItem(itemId);
  }, [haptic, onRetryItem]);

  const handleSetCover = useCallback((itemId: string) => {
    haptic.medium();
    onSetCover?.(itemId);
  }, [haptic, onSetCover]);

  const prevStatusMap = useRef<Record<string, ItemStatus>>({});
  useEffect(() => {
    const next: Record<string, ItemStatus> = {};
    for (const item of items) {
      const status = getItemStatus(item, queueItems);
      next[item.id] = status;
      const prev = prevStatusMap.current[item.id];
      if (prev !== status) {
        if (status === 'uploaded') {
          haptic.success();
        } else if (status === 'failed') {
          haptic.warning();
        }
      }
    }
    prevStatusMap.current = next;
  }, [items, queueItems, haptic]);

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <Pressable
          style={styles.emptyCanvas}
          onPress={handlePickLibrary}
          accessibilityRole="button"
          accessibilityLabel="Add photos from library"
        >
          <View style={styles.emptyDashed}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="camera-outline" size={28} color={colors.brand} aria-hidden={true} />
            </View>
            <Text style={styles.emptyTitle}>Start with a photo</Text>
            <Text style={styles.emptySub}>Tap to upload from your library</Text>
            <Text style={styles.emptyHint}>Well-lit photos from multiple angles sell faster</Text>
          </View>
        </Pressable>

        <View style={styles.emptyActions}>
          <Pressable
            style={styles.emptySecondaryBtn}
            onPress={handlePickCamera}
            accessibilityRole="button"
            accessibilityLabel="Take photo with camera"
          >
            <Ionicons name="camera" size={18} color={colors.textPrimary} aria-hidden={true} style={{ marginRight: Space.sm }} />
            <Text style={styles.emptySecondaryText}>Take photo</Text>
          </Pressable>
          <Text style={styles.emptyCount}>0 / {maxCount}</Text>
        </View>

        {errorText ? (
          <Text style={styles.errorText}>{errorText}</Text>
        ) : null}
      </View>
    );
  }

  const coverItem = items[0];
  const coverDisplayUri = getDisplayUri(coverItem);
  const coverStatus = getItemStatus(coverItem, queueItems);
  const isCoverVideo = isVideoUri(coverDisplayUri);
  const coverCanRemove = canRemoveItem ? canRemoveItem(coverItem.id) : true;
  const photoUris = items.map(getDisplayUri);
  const itemIds = items.map((m) => m.id);

  /* Render each thumbnail inside SortablePhotoStrip */
  const renderThumbItem = (index: number) => {
    const item = items[index];
    if (!item) return null;
    const displayUri = getDisplayUri(item);
    const status = getItemStatus(item, queueItems);
    const isVideo = isVideoUri(displayUri);
    const canRemove = canRemoveItem ? canRemoveItem(item.id) : true;
    const isFailed = status === 'failed';

    return (
      <View style={[styles.thumbContent, isFailed && styles.thumbContentFailed]}>
        {isVideo ? (
          <View style={styles.thumbVideoTile}>
            <Ionicons name="videocam" size={22} color={colors.textMuted} aria-hidden={true} />
          </View>
        ) : (
          <ExpoImage
            source={{ uri: displayUri }}
            style={styles.thumbImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={displayUri}
          />
        )}

        {isVideo && (
          <View style={styles.thumbVideoBadge}>
            <Ionicons name="videocam" size={12} color={colors.scrimTextPrimary} aria-hidden={true} />
          </View>
        )}

        {item.id === coverItem.id && (
          <View style={styles.thumbCoverBadge}>
            <Text style={styles.thumbCoverText}>COVER</Text>
          </View>
        )}

        <View style={styles.thumbNumberBadge}>
          <Text style={styles.thumbNumberText}>{index + 1}</Text>
        </View>

        <UploadProgressOverlay
          status={status}
          trackWidth={THUMB_SIZE}
          variant="thumb"
          reducedMotion={reducedMotion}
          colors={colors}
          styles={styles}
        />

        {status === 'uploaded' && (
          <UploadedCheckBadge
            variant="thumb"
            reducedMotion={reducedMotion}
            spring={spring}
            colors={colors}
            styles={styles}
          />
        )}

        {isFailed && (
          <Pressable
            style={styles.thumbFailedOverlay}
            onPress={() => handleRetry(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Retry upload for ${isVideo ? 'video' : 'photo'} ${index + 1}`}
          >
            <Ionicons name="warning" size={14} color={colors.scrimTextPrimary} aria-hidden={true} />
            <Text style={styles.thumbRetryText}>Tap to retry</Text>
            <View style={styles.thumbRetryBtn}>
              <Ionicons name="refresh" size={12} color={colors.textInverse} aria-hidden={true} />
              <Text style={styles.thumbRetryBtnText}>Retry</Text>
            </View>
          </Pressable>
        )}

        {status === 'cancelled' && (
          <View style={styles.thumbCancelledOverlay}>
            <Ionicons name="ban" size={14} color={colors.scrimTextPrimary} aria-hidden={true} />
            <Text style={styles.thumbCancelledText}>Cancelled</Text>
          </View>
        )}

        {canRemove && (
          <Pressable
            style={styles.thumbRemoveBtn}
            onPress={() => handleRemove(item.id)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`${removeLabel} ${isVideo ? 'video' : 'photo'} ${index + 1}`}
          >
            <Ionicons name="close" size={12} color={colors.textInverse} aria-hidden={true} />
          </Pressable>
        )}

        {/* ── Set as cover ──
            Per audit 04 P0: "Add cover-photo semantics and explicit reorder
            affordance." A compact "Set cover" button on non-cover thumbnails.
            Only shown when onSetCover is provided and the item is not already
            the cover. Positioned at bottom-left to avoid collision with the
            remove button (top-right) and number badge (top-left). */}
        {onSetCover && item.id !== coverItem.id && status !== 'failed' && status !== 'cancelled' && (
          <Pressable
            style={styles.thumbSetCoverBtn}
            onPress={() => handleSetCover(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Set ${isVideo ? 'video' : 'photo'} ${index + 1} as cover`}
          >
            <Ionicons name="star-outline" size={12} color={colors.scrimTextPrimary} aria-hidden={true} />
            <Text style={styles.thumbSetCoverText}>Cover</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Large cover preview ── */}
      <View style={styles.coverWrap}>
        {isCoverVideo ? (
          <Video
            source={{ uri: coverDisplayUri }}
            style={styles.coverImage}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            isMuted
            isLooping={false}
            useNativeControls
            onError={() => {
              /* fallback handled by background color */
            }}
          />
        ) : (
          <ExpoImage
            source={{ uri: coverDisplayUri }}
            style={styles.coverImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={coverDisplayUri}
            transition={200}
          />
        )}

        {/* Cover badge */}
        <View style={styles.coverBadge}>
          <Text style={styles.coverBadgeText}>COVER</Text>
        </View>

        {/* Video indicator */}
        {isCoverVideo && (
          <View style={styles.videoIndicator}>
            <Ionicons name="videocam" size={14} color={colors.scrimTextPrimary} aria-hidden={true} />
            <Text style={styles.videoText}>VIDEO</Text>
          </View>
        )}

        {/* Media count */}
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{items.length} / {maxCount}</Text>
        </View>

        {/* Remove cover — only for removable items */}
        {coverCanRemove && (
          <Pressable
            style={styles.coverRemoveBtn}
            onPress={() => handleRemove(coverItem.id)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={`${removeLabel} cover ${isCoverVideo ? 'video' : 'photo'}`}
          >
            <Ionicons name="close-circle" size={22} color={colors.scrimTextPrimary} aria-hidden={true} />
          </Pressable>
        )}

        {/* Cover upload progress overlay */}
        <UploadProgressOverlay
          status={coverStatus}
          trackWidth={screenWidth}
          variant="cover"
          reducedMotion={reducedMotion}
          colors={colors}
          styles={styles}
        />

        {coverStatus === 'uploaded' && (
          <UploadedCheckBadge
            variant="cover"
            reducedMotion={reducedMotion}
            spring={spring}
            colors={colors}
            styles={styles}
          />
        )}

        {/* Cover failed overlay with Retry + Remove */}
        {coverStatus === 'failed' && (
          <View style={styles.coverFailedOverlay}>
            <Ionicons name="warning" size={16} color={colors.textInverse} aria-hidden={true} />
            <Text style={styles.coverFailedText}>Upload failed</Text>
            <Pressable
              style={styles.coverRetryBtn}
              onPress={() => handleRetry(coverItem.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Retry upload for cover ${isCoverVideo ? 'video' : 'photo'}`}
            >
              <Ionicons name="refresh" size={14} color={colors.textInverse} aria-hidden={true} />
              <Text style={styles.coverRetryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Cover cancelled overlay */}
        {coverStatus === 'cancelled' && (
          <View style={styles.coverCancelledOverlay}>
            <Ionicons name="ban" size={16} color={colors.scrimTextPrimary} aria-hidden={true} />
            <Text style={styles.coverCancelledText}>Cancelled</Text>
          </View>
        )}
      </View>

      {/* ── Sortable thumbnail rail ── */}
      <SortablePhotoStrip
        photos={photoUris}
        itemIds={itemIds}
        onReorder={handleReorder}
        renderItem={renderThumbItem}
        showAddButton={false}
        reorderEnabled={reorderEnabled}
      />

      {/* Locked note for immutable remote media */}
      {lockedNote && (
        <Text style={styles.lockedNote}>{lockedNote}</Text>
      )}

      {/* ── Add more + Camera actions ── */}
      <View style={styles.studioActions}>
        {items.length < maxCount && (
          <Pressable
            style={styles.studioActionBtn}
            onPress={handlePickLibrary}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Add more photos from library"
          >
            <Ionicons name="images-outline" size={16} color={colors.textSecondary} aria-hidden={true} />
            <Text style={styles.studioActionText}>Add more</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.studioActionBtn}
          onPress={handlePickCamera}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Take photo with camera"
        >
          <Ionicons name="camera-outline" size={16} color={colors.textSecondary} aria-hidden={true} />
          <Text style={styles.studioActionText}>Camera</Text>
        </Pressable>
      </View>

      {/* Overall media validation error (not asset-specific) */}
      {errorText ? (
        <Text style={styles.errorText}>{errorText}</Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors, screenWidth: number, coverHeight: number) {
  return StyleSheet.create({
  container: {
    width: screenWidth,
  },
  emptyCanvas: {
    width: screenWidth,
    paddingHorizontal: Space.md,
    paddingVertical: Space.lg,
    alignItems: 'center',
  },
  emptyDashed: {
    width: '100%',
    height: coverHeight,
    borderWidth: Stroke.standard,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: `${colors.brand}0D`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  emptyTitle: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    marginBottom: Space.xs,
  },
  emptySub: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  emptyHint: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.sm,
    opacity: 0.7,
  },
  emptyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: screenWidth - Space.md * 2,
    marginTop: Space.md,
  },
  emptySecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: 12,
    borderRadius: Radius.xxl,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  emptySecondaryText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  emptyCount: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  coverWrap: {
    width: screenWidth,
    height: coverHeight,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  coverImage: {
    width: screenWidth,
    height: coverHeight,
  },
  coverBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  coverBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: colors.scrimTextPrimary,
    letterSpacing: 0.5,
  },
  videoIndicator: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm + 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  videoText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: colors.scrimTextPrimary,
  },
  countBadge: {
    position: 'absolute',
    bottom: Space.sm,
    left: Space.sm,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  countText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.scrimTextPrimary,
  },
  coverRemoveBtn: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverStatusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverStatusLabel: {
    position: 'absolute',
    bottom: Space.lg,
    alignItems: 'center',
    gap: 2,
  },
  coverProgressPct: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    color: colors.scrimTextPrimary,
  },
  coverProgressBarTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  coverUploadedBadge: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
  },
  coverFailedOverlay: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  coverFailedText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.textInverse,
  },
  coverRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  coverRetryText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    color: colors.textInverse,
  },
  coverCancelledOverlay: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
  },
  coverCancelledText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.scrimTextPrimary,
  },
  /* ── thumbnail content (inside SortablePhotoStrip) ── */
  thumbContent: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.surfaceAlt,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
  },
  thumbContentFailed: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  thumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md,
  },
  thumbVideoTile: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbVideoBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCoverBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  thumbCoverText: {
    color: colors.background,
    fontSize: 8,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.3,
  },
  thumbNumberBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbNumberText: {
    color: colors.background,
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
  thumbStatusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbStatusLabel: {
    position: 'absolute',
    bottom: 8,
    alignItems: 'center',
  },
  thumbProgressBarTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBarFill: {
    height: 3,
    backgroundColor: colors.brand,
  },
  thumbUploadedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
  thumbFailedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  thumbRetryText: {
    fontSize: 9,
    fontFamily: Typography.family.semibold,
    color: colors.scrimTextPrimary,
  },
  thumbRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: colors.danger,
  },
  thumbRetryBtnText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: colors.textInverse,
  },
  thumbCancelledOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  thumbCancelledText: {
    fontSize: 9,
    fontFamily: Typography.family.semibold,
    color: colors.scrimTextPrimary,
  },
  thumbRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* ── Set as cover button ──
     Per audit 04 P0: explicit cover-photo semantics.
     Compact pill at bottom-left — distinct from remove (top-right)
     and number badge (top-left). Semi-transparent dark for legibility
     over any image. */
  thumbSetCoverBtn: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  thumbSetCoverText: {
    fontSize: 9,
    fontFamily: Typography.family.semibold,
    color: colors.scrimTextPrimary,
    letterSpacing: 0.3,
  },
  /* ── studio actions ── */
  studioActions: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    gap: Space.md,
  },
  studioActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.xs,
    minHeight: 44,
  },
  studioActionText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
  },
  lockedNote: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    paddingHorizontal: Space.md,
    paddingTop: 6,
    textAlign: 'center',
  },
  });
}
