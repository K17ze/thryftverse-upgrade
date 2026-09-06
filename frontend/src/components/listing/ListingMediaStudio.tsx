import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  cancelAnimation,
  Easing } from 'react-native-reanimated';
import { AppIcon } from '../common/AppIcon';
import { Image as ExpoImage } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, AspectRatio, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';
import { SortablePhotoStrip } from '../SortablePhotoStrip';
import { FocalImage } from '../media/FocalImage';
import { CreatorCropSheet } from '../../creator/CreatorCropSheet';
import { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import { UploadQueueItem } from '../../services/mediaUploadQueue';
import { isVideoUri } from '../../utils/media';
import { useVideoPoster } from '../../platform/media/videoPoster';
import { Video, ResizeMode } from '../compat/Video';

const THUMB_SIZE = 80;

type ItemStatus = 'draft' | 'pending' | 'preparing' | 'uploading' | 'uploaded' | 'failed' | 'cancelled';

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
  /** Edit-Listing: label for the remove action (default: 'Remove') */
  removeLabel?: string;
  /** Edit-Listing: returns true if the item can be removed (default: true for all) */
  canRemoveItem?: (itemId: string) => boolean;
  /** Edit-Listing: whether drag reorder is enabled (default: true) */
  reorderEnabled?: boolean;
  /** Edit-Listing: optional note shown below the strip when reorder is disabled */
  lockedNote?: string;
  /**
   * Called when the user applies a crop/rotate/flip transform to an item.
   * The host replaces the item's URI with the transformed result. A
   * focal-point change passes the item's current URI so hosts can store
   * the point without re-queueing the upload.
   */
  onTransformItem?: (itemId: string, transformedUri: string, focalPoint?: { x: number; y: number }) => void;
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

/** Real byte progress (0-1) for an item's active upload attempt. */
function getItemProgress(
  item: ListingMediaDraftItem,
  queueItems: UploadQueueItem[]
): number {
  return queueItems.find((q) => q.id === item.id)?.progress ?? 0;
}

function getDisplayUri(item: ListingMediaDraftItem): string {
  return item.publicUrl || item.uri;
}

/** Schemes expo-image-manipulator reads directly. */
const MANIPULABLE_URI = /^(file|content):\/\//i;
/** Local library URIs (iOS photos) that need a temp file copy first. */
const LIBRARY_URI = /^(ph|assets-library):\/\//i;

// iOS library-backed assets (ph:// / assets-library://) must land on disk
// before the crop sheet's manipulator can read them.
async function resolveCropSourceUri(uri: string): Promise<string> {
  if (!LIBRARY_URI.test(uri)) return uri;
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return uri;
  try {
    const dest = `${cacheDir}crop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

/**
 * Bottom-edge upload status: a 2pt determinate bar chasing real byte
 * progress, plus a small status label on the cover. 'preparing' sweeps the
 * bar instead of fabricating a percentage; 'pending' renders nothing (the
 * media dims instead). The media itself stays visible — no full-surface
 * overlay, no pulse.
 */
function UploadProgressOverlay({
  status,
  progress: byteProgress,
  trackWidth,
  showStatus,
  reducedMotion,
  styles }: {
  status: ItemStatus;
  /** Real transmitted-byte progress (0-1) from the upload queue. */
  progress: number;
  trackWidth: number;
  /** Cover carries the status label; thumbs stay bar-only. */
  showStatus: boolean;
  reducedMotion: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const progress = useSharedValue(byteProgress);
  // 'preparing' has no bytes on the wire yet — the bar sweeps instead of
  // showing a fabricated percentage.
  const isPreparing = status === 'preparing';
  const sweep = useSharedValue(0);

  // Determinate bar chases real byte progress as ticks arrive.
  useEffect(() => {
    progress.value = withTiming(byteProgress, {
      duration: reducedMotion ? 0 : Motion.duration.fast,
      easing: Easing.out(Easing.cubic) });
  }, [byteProgress, reducedMotion, progress]);

  // Indeterminate sweep while preparing. Reduced motion: static bar —
  // the label alone carries the state.
  useEffect(() => {
    if (isPreparing && !reducedMotion) {
      sweep.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: Motion.duration.slow, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.65, { duration: Motion.duration.slow, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(sweep);
      sweep.value = 0;
    }
  }, [isPreparing, reducedMotion, sweep]);

  const fillStyle = useAnimatedStyle(() => ({
    width: trackWidth * (isPreparing ? sweep.value : progress.value) }));

  if (status !== 'preparing' && status !== 'uploading') return null;

  const pct = Math.round(byteProgress * 100);

  return (
    <View style={styles.progressOverlay} pointerEvents="none">
      {showStatus && (
        <Text style={styles.progressText}>
          {isPreparing ? 'Preparing…' : `Uploading · ${pct}%`}
        </Text>
      )}
      <View style={styles.progressTrack}>
        <Reanimated.View style={[styles.progressFill, fillStyle]} />
      </View>
    </View>
  );
}

function UploadedCheckBadge({
  reducedMotion,
  spring,
  styles }: {
  reducedMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
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
    <Reanimated.View style={[styles.uploadedCheck, style]} pointerEvents="none">
      <AppIcon
        name="checkmark-circle"
        size={16}
        color="success"
        accessible={false}
        style={styles.mediaGlyph}
      />
    </Reanimated.View>
  );
}

/**
 * Video thumbnail backed by a real poster frame.
 *
 * The frame is decoded once per video by expo-video's native thumbnail
 * generator (platform/media/videoPoster) and rendered as a plain image with
 * a compact play glyph — no live player per thumbnail. Until the frame
 * resolves, and permanently on web (no native decoder), it falls back to
 * the videocam tile below.
 */
const VideoPosterThumb = React.memo(function VideoPosterThumb({
  uri,
  styles,
  dimmed }: {
  uri: string;
  styles: ReturnType<typeof createStyles>;
  dimmed?: boolean;
}) {
  const poster = useVideoPoster(uri);

  return (
    <View style={[styles.thumbVideoTile, dimmed && styles.mediaDimmed]}>
      {poster ? (
        <>
          <ExpoImage
            source={poster}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
          <View style={styles.thumbPlayBadge} pointerEvents="none">
            <AppIcon name="play" variant="filled" size={11} color="scrimTextPrimary" accessible={false} />
          </View>
        </>
      ) : (
        <AppIcon name="videocam" variant="filled" size={22} color="textMuted" accessible={false} />
      )}
    </View>
  );
});

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
  removeLabel = 'Remove',
  canRemoveItem,
  reorderEnabled = true,
  lockedNote,
  onTransformItem }: ListingMediaStudioProps) {
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

  // ── Cover crop sheet ──
  // The cover "Edit" button opens the full gesture crop sheet
  // (CreatorCropSheet), which supersedes the old inline rotate/flip bar.
  // Holds the URI the sheet edits — the display URI, or a temp file copy
  // for library-backed URIs. Null = closed.
  const [cropSheetUri, setCropSheetUri] = useState<string | null>(null);

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

  const coverItem = items[0];
  const coverDisplayUri = coverItem ? getDisplayUri(coverItem) : '';
  const coverStatus = coverItem ? getItemStatus(coverItem, queueItems) : 'draft';
  const isCoverVideo = isVideoUri(coverDisplayUri);
  const coverCanRemove = coverItem ? (canRemoveItem ? canRemoveItem(coverItem.id) : true) : true;
  const photoUris = items.map(getDisplayUri);
  const itemIds = items.map((m) => m.id);

  // ── Edit entry guard ──
  // Local image URIs can go through expo-image-manipulator: file:// and
  // content:// directly, iOS library URIs (ph:// / assets-library://) via a
  // temp file copy. Videos and remote http(s) items stay locked.
  const canEditCover = Boolean(
    onTransformItem &&
    coverItem &&
    !isCoverVideo &&
    coverItem.kind !== 'video' &&
    coverStatus !== 'failed' &&
    coverStatus !== 'cancelled' &&
    (MANIPULABLE_URI.test(coverDisplayUri) || LIBRARY_URI.test(coverDisplayUri))
  );

  // Crop-sheet completion → existing host contract: the host replaces the
  // item's URI with the transformed result. The final focal point is already
  // persisted — the sheet emits onFocalPointChange before onCropComplete —
  // and a render-time capture here would be staler than that emission.
  const handleCropComplete = useCallback((newUri: string) => {
    if (!onTransformItem || !coverItem) return;
    onTransformItem(coverItem.id, newUri);
    haptic.success();
  }, [onTransformItem, coverItem, haptic]);

  // Focal taps persist through the same host contract; passing the item's
  // current URI keeps the transform a no-op so upload state is untouched.
  const handleFocalChange = useCallback((point: { x: number; y: number }) => {
    if (!onTransformItem || !coverItem) return;
    onTransformItem(coverItem.id, coverItem.uri, point);
  }, [onTransformItem, coverItem]);

  // Resolve the crop source before opening the sheet — a no-op for file://
  // and content://, a temp-file copy for library URIs.
  const handleEditCover = useCallback(async () => {
    if (!coverItem) return;
    haptic.light();
    setCropSheetUri(await resolveCropSourceUri(coverDisplayUri));
  }, [coverItem, coverDisplayUri, haptic]);

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <Pressable
          style={styles.emptySurface}
          onPress={handlePickLibrary}
          accessibilityRole="button"
          accessibilityLabel="Add photos from library"
        >
          <AppIcon name="camera" size={24} color="textMuted" accessible={false} style={styles.emptyGlyph} />
          <Text style={styles.emptyTitle}>Add your first photo</Text>
          <Text style={styles.emptyMeta}>Up to {maxCount} photos</Text>
        </Pressable>

        <View style={styles.emptyActions}>
          <Pressable
            style={styles.emptyCameraBtn}
            onPress={handlePickCamera}
            accessibilityRole="button"
            accessibilityLabel="Take photo with camera"
          >
            <AppIcon name="camera" size={16} color="textMuted" accessible={false} />
            <Text style={styles.emptyCameraText}>Take photo</Text>
          </Pressable>
        </View>

        {errorText ? (
          <Text style={styles.errorText}>{errorText}</Text>
        ) : null}
      </View>
    );
  }

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
          <VideoPosterThumb uri={displayUri} styles={styles} dimmed={status === 'pending'} />
        ) : (
          <FocalImage
            uri={displayUri}
            focalPoint={item.focalPoint}
            style={[styles.thumbImage, status === 'pending' && styles.mediaDimmed]}
          />
        )}

        <UploadProgressOverlay
          status={status}
          progress={getItemProgress(item, queueItems)}
          trackWidth={THUMB_SIZE}
          showStatus={false}
          reducedMotion={reducedMotion}
          styles={styles}
        />

        {status === 'uploaded' && (
          <UploadedCheckBadge
            reducedMotion={reducedMotion}
            spring={spring}
            styles={styles}
          />
        )}

        {isFailed && (
          <Pressable
            style={styles.failedOverlay}
            onPress={() => handleRetry(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Retry upload for ${isVideo ? 'video' : 'photo'} ${index + 1}`}
          >
            <AppIcon name="warning" variant="filled" size={14} color="scrimTextPrimary" accessible={false} />
            <Text style={styles.overlayStateText}>Retry</Text>
          </Pressable>
        )}

        {status === 'cancelled' && (
          <View style={styles.cancelledOverlay} pointerEvents="none">
            <AppIcon name="ban" variant="filled" size={14} color="scrimTextPrimary" accessible={false} />
            <Text style={styles.overlayStateText}>Cancelled</Text>
          </View>
        )}

        {canRemove && (
          <Pressable
            style={styles.thumbRemoveBtn}
            onPress={() => handleRemove(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${removeLabel} ${isVideo ? 'video' : 'photo'} ${index + 1}`}
          >
            <AppIcon name="close" size={16} color="scrimTextPrimary" accessible={false} style={styles.mediaGlyph} />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Cover — the media is the interface ── */}
      <View style={styles.coverWrap}>
        {isCoverVideo ? (
          <Video
            source={{ uri: coverDisplayUri }}
            style={[styles.coverImage, coverStatus === 'pending' && styles.mediaDimmed]}
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
          <FocalImage
            uri={coverDisplayUri}
            focalPoint={coverItem.focalPoint}
            style={[styles.coverImage, coverStatus === 'pending' && styles.mediaDimmed]}
            transition={200}
            recyclingKey={coverDisplayUri}
          />
        )}

        {/* Upload status — 2pt bar + label, no full-surface overlay */}
        <UploadProgressOverlay
          status={coverStatus}
          progress={getItemProgress(coverItem, queueItems)}
          trackWidth={screenWidth}
          showStatus
          reducedMotion={reducedMotion}
          styles={styles}
        />

        {coverStatus === 'uploaded' && (
          <UploadedCheckBadge
            reducedMotion={reducedMotion}
            spring={spring}
            styles={styles}
          />
        )}

        {coverStatus === 'failed' && (
          <Pressable
            style={styles.failedOverlay}
            onPress={() => handleRetry(coverItem.id)}
            accessibilityRole="button"
            accessibilityLabel={`Retry upload for cover ${isCoverVideo ? 'video' : 'photo'}`}
          >
            <AppIcon name="warning" variant="filled" size={16} color="scrimTextPrimary" accessible={false} />
            <Text style={styles.overlayStateText}>Retry</Text>
          </Pressable>
        )}

        {coverStatus === 'cancelled' && (
          <View style={styles.cancelledOverlay} pointerEvents="none">
            <AppIcon name="ban" variant="filled" size={16} color="scrimTextPrimary" accessible={false} />
            <Text style={styles.overlayStateText}>Cancelled</Text>
          </View>
        )}

        {coverCanRemove && (
          <Pressable
            style={styles.coverRemoveBtn}
            onPress={() => handleRemove(coverItem.id)}
            accessibilityRole="button"
            accessibilityLabel={`${removeLabel} cover ${isCoverVideo ? 'video' : 'photo'}`}
          >
            <AppIcon name="close" size={20} color="scrimTextPrimary" accessible={false} style={styles.mediaGlyph} />
          </Pressable>
        )}

        {/* ── Edit cover — opens the gesture crop sheet ──
            Local images open directly; iOS library URIs are copied to a
            temp file first. Videos and remote-only items never get here. */}
        {canEditCover && (
          <Pressable
            style={styles.coverEditBtn}
            onPress={() => { void handleEditCover(); }}
            accessibilityRole="button"
            accessibilityLabel="Edit cover photo"
          >
            <AppIcon name="edit" size={20} color="scrimTextPrimary" accessible={false} style={styles.mediaGlyph} />
          </Pressable>
        )}
      </View>

      {/* ── Thumbnail rail ── */}
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

      {/* ── Quiet action row — count lives in the Add-more label ── */}
      <View style={styles.studioActions}>
        {items.length < maxCount && (
          <Pressable
            style={styles.studioActionBtn}
            onPress={handlePickLibrary}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Add more photos from library"
          >
            <AppIcon name="images" size={16} color="textMuted" accessible={false} />
            <Text style={styles.studioActionText}>
              Add more
              <Text style={styles.studioActionCount}> · {items.length}/{maxCount}</Text>
            </Text>
          </Pressable>
        )}
        <Pressable
          style={styles.studioActionBtn}
          onPress={handlePickCamera}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Take photo with camera"
        >
          <AppIcon name="camera" size={16} color="textMuted" accessible={false} />
          <Text style={styles.studioActionText}>Take photo</Text>
        </Pressable>
      </View>

      {/* Overall media validation error (not asset-specific) */}
      {errorText ? (
        <Text style={styles.errorText}>{errorText}</Text>
      ) : null}

      {/* ── Cover crop sheet ── */}
      {cropSheetUri && (
        <CreatorCropSheet
          visible
          imageUri={cropSheetUri}
          focalPoint={coverItem.focalPoint}
          onFocalPointChange={handleFocalChange}
          onClose={() => setCropSheetUri(null)}
          onCropComplete={handleCropComplete}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors, screenWidth: number, coverHeight: number) {
  return StyleSheet.create({
  container: {
    width: screenWidth },
  /* ── empty state ── */
  emptySurface: {
    width: screenWidth,
    height: coverHeight,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center' },
  emptyGlyph: {
    marginBottom: Space.sm },
  emptyTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary,
    marginBottom: Space.xxs },
  emptyMeta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  emptyActions: {
    paddingHorizontal: Space.md,
    marginTop: Space.xs },
  emptyCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit,
    paddingHorizontal: Space.xs },
  emptyCameraText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary },
  /* ── cover ── */
  coverWrap: {
    width: screenWidth,
    height: coverHeight,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  coverImage: {
    width: screenWidth,
    height: coverHeight },
  mediaDimmed: {
    opacity: 0.4 },
  /* Transparent 44pt targets — glyph-only, legible via text shadow
     (same grammar as MediaStage controlIcon). No circles, no pills. */
  coverRemoveBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  coverEditBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  mediaGlyph: {
    textShadowColor: colors.mediaOverlayShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4 },
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0 },
  progressText: {
    position: 'absolute',
    left: Space.md,
    bottom: Space.sm,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextPrimary,
    textShadowColor: colors.mediaOverlayShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3 },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.scrimTextTertiary },
  progressFill: {
    height: 2,
    backgroundColor: colors.brand },
  uploadedCheck: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm },
  failedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.mediaOverlayScrim,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs },
  cancelledOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs },
  overlayStateText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.scrimTextPrimary },
  /* ── thumbnails (inside SortablePhotoStrip) ── */
  thumbContent: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.surfaceAlt,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  thumbContentFailed: {
    borderColor: colors.danger,
    borderWidth: Stroke.emphasis },
  thumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.lg },
  thumbVideoTile: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center' },
  /* Play glyph over a real poster frame — scrim circle is the sanctioned
     circular exception (decorative; aria-hidden). */
  thumbPlayBadge: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  thumbRemoveBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  /* ── quiet action row ── */
  studioActions: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    gap: Space.md },
  studioActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit,
    paddingHorizontal: Space.xs },
  studioActionText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary },
  studioActionCount: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  errorText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs },
  lockedNote: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    textAlign: 'center' } });
}
