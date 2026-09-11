import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable } from 'react-native';
import { AppIcon } from '../common/AppIcon';
import { Image as ExpoImage } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, AspectRatio, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { SortablePhotoStrip } from '../SortablePhotoStrip';
import { FocalImage } from '../media/FocalImage';
import { CreatorCropSheet } from '../../creator/CreatorCropSheet';
import { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import { UploadQueueItem } from '../../services/mediaUploadQueue';
import { isVideoUri } from '../../utils/media';
import { useVideoPoster } from '../../platform/media/videoPoster';
import { Video, ResizeMode } from '../compat/Video';
import { UploadProgressRing, type ItemStatus } from './UploadProgressRing';

const THUMB_SIZE = 80;

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
  /** When true, the upload queue is paused due to no connectivity. */
  isOffline?: boolean;
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
  queueItemMap: Map<string, UploadQueueItem>
): ItemStatus {
  const queueItem = queueItemMap.get(item.id);
  if (queueItem) {
    return queueItem.state as ItemStatus;
  }
  return item.status as ItemStatus;
}

/** Real byte progress (0-1) for an item's active upload attempt. */
function getItemProgress(
  item: ListingMediaDraftItem,
  queueItemMap: Map<string, UploadQueueItem>
): number {
  return queueItemMap.get(item.id)?.progress ?? 0;
}

function getDisplayUri(item: ListingMediaDraftItem): string {
  return item.publicUrl || item.uri;
}

/** Schemes expo-image-manipulator reads directly. */
const MANIPULABLE_URI = /^(file|content):\/\//i;
/** Local library URIs (iOS photos) that need a temp file copy first. */
const LIBRARY_URI = /^(ph|assets-library):\/\//i;

// iOS library-backed assets (ph:// / assets-library://) must land on disk
// before the crop sheet's manipulator can read them. Throws on copy failure
// so the caller can surface feedback instead of handing an unreadable ph://
// URI to expo-image-manipulator (which would fail with an opaque error).
async function resolveCropSourceUri(uri: string): Promise<string> {
  if (!LIBRARY_URI.test(uri)) return uri;
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('No cache directory available to stage library asset.');
  }
  const dest = `${cacheDir}crop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
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
  isOffline = false,
  onTransformItem }: ListingMediaStudioProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const coverHeight = Math.round(screenWidth / AspectRatio.marketplace);
  const styles = React.useMemo(
    () => createStyles(colors, screenWidth, coverHeight),
    [colors, screenWidth, coverHeight],
  );

  // O(1) queue lookup keyed by item id — rebuilt once per queueItems change.
  const queueItemMap = useMemo(() => {
    const map = new Map<string, UploadQueueItem>();
    for (const q of queueItems) map.set(q.id, q);
    return map;
  }, [queueItems]);

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

  // ── Crop sheet ──
  // Any editable item opens the full gesture crop sheet (CreatorCropSheet).
  // cropTargetId tracks WHICH item is being edited — first position is the
  // cover, but every image gets the same affordance. Holds the URI the
  // sheet edits — the display URI, or a temp file copy for library-backed
  // URIs. Null = closed.
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);
  const [cropSheetUri, setCropSheetUri] = useState<string | null>(null);
  const cropTarget = cropTargetId ? items.find((i) => i.id === cropTargetId) : undefined;

  const prevStatusMap = useRef<Record<string, ItemStatus>>({});
  useEffect(() => {
    const next: Record<string, ItemStatus> = {};
    for (const item of items) {
      const status = getItemStatus(item, queueItemMap);
      next[item.id] = status;
      const prev = prevStatusMap.current[item.id];
      if (prev !== status) {
        if (status === 'uploaded') {
          haptic.success();
        } else if (status === 'failed') {
          haptic.error();
        }
      }
    }
    prevStatusMap.current = next;
  }, [items, queueItems, queueItemMap, haptic]);

  const coverItem = items[0];
  const coverDisplayUri = coverItem ? getDisplayUri(coverItem) : '';
  const coverStatus = coverItem ? getItemStatus(coverItem, queueItemMap) : 'draft';
  const isCoverVideo = isVideoUri(coverDisplayUri);
  const coverCanRemove = coverItem ? (canRemoveItem ? canRemoveItem(coverItem.id) : true) : true;
  const photoUris = items.map(getDisplayUri);
  const itemIds = items.map((m) => m.id);

  // ── Edit entry guard ──
  // Any IMAGE item (not video, not failed/cancelled) whose URI the crop
  // sheet's manipulator can read: file:// and content:// directly, iOS
  // library URIs (ph:// / assets-library://) via a temp file copy. Videos
  // and remote http(s) items stay locked.
  const canEditItem = useCallback((item: ListingMediaDraftItem, status: ItemStatus): boolean => {
    if (!onTransformItem) return false;
    const uri = item.uri;
    return (
      !isVideoUri(uri) &&
      item.kind !== 'video' &&
      status !== 'failed' &&
      status !== 'cancelled' &&
      (MANIPULABLE_URI.test(uri) || LIBRARY_URI.test(uri))
    );
  }, [onTransformItem]);

  const coverEditable = coverItem ? canEditItem(coverItem, coverStatus) : false;

  // Crop-sheet completion → existing host contract: the host replaces the
  // item's URI with the transformed result. The final focal point is already
  // persisted — the sheet emits onFocalPointChange before onCropComplete —
  // and a render-time capture here would be staler than that emission.
  const handleCropComplete = useCallback((newUri: string) => {
    if (!onTransformItem || !cropTarget) return;
    onTransformItem(cropTarget.id, newUri);
    haptic.success();
  }, [onTransformItem, cropTarget, haptic]);

  // Focal taps persist through the same host contract; passing the item's
  // current URI keeps the transform a no-op so upload state is untouched.
  const handleFocalChange = useCallback((point: { x: number; y: number }) => {
    if (!onTransformItem || !cropTarget) return;
    onTransformItem(cropTarget.id, cropTarget.uri, point);
  }, [onTransformItem, cropTarget]);

  // Resolve the crop source before opening the sheet — a no-op for file://
  // and content://, a temp-file copy for library URIs. If staging fails
  // (e.g. iOS photo asset unreadable), bail with error haptics rather than
  // opening the sheet on an un-manipulable URI.
  const handleEditItem = useCallback(async (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    haptic.light();
    let stagedUri: string;
    try {
      stagedUri = await resolveCropSourceUri(item.uri);
    } catch {
      haptic.error();
      return;
    }
    setCropTargetId(itemId);
    setCropSheetUri(stagedUri);
  }, [items, haptic]);

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <Pressable
          style={styles.emptySurface}
          onPress={handlePickLibrary}
          accessibilityRole="button"
          accessibilityLabel="Add photos from library"
        >
          <AppIcon name="image-outline" size={28} color="textMuted" accessible={false} style={styles.emptyGlyph} />
          <Text style={styles.emptyLabel}>Add photos</Text>
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
    const status = getItemStatus(item, queueItemMap);
    const isVideo = isVideoUri(displayUri);
    const canRemove = canRemoveItem ? canRemoveItem(item.id) : true;
    const editable = canEditItem(item, status);

    return (
      <View style={styles.thumbContent}>
        {isVideo ? (
          <VideoPosterThumb uri={displayUri} styles={styles} dimmed={status === 'pending'} />
        ) : (
          <FocalImage
            uri={displayUri}
            focalPoint={item.focalPoint}
            style={[styles.thumbImage, status === 'pending' && styles.mediaDimmed]}
          />
        )}

        <UploadProgressRing
          status={status}
          progress={getItemProgress(item, queueItemMap)}
          reducedMotion={reducedMotion}
          isOffline={isOffline}
          onRetry={() => handleRetry(item.id)}
          retryLabel={`Retry upload for ${isVideo ? 'video' : 'photo'} ${index + 1}`}
        />

        {editable && (
          <Pressable
            style={styles.thumbEditBtn}
            onPress={() => { void handleEditItem(item.id); }}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${isVideo ? 'video' : 'photo'} ${index + 1}`}
          >
            <View style={styles.editScrim}>
              <AppIcon name="edit" size={28} color="textInverse" accessible={false} />
            </View>
          </Pressable>
        )}

        {canRemove && (
          <Pressable
            style={styles.thumbRemoveBtn}
            onPress={() => handleRemove(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${removeLabel} ${isVideo ? 'video' : 'photo'} ${index + 1}`}
          >
            <AppIcon name="close" size={16} color="scrimTextPrimary" accessible={false} glyphStyle={styles.mediaGlyph} />
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
              haptic.error();
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

        <UploadProgressRing
          status={coverStatus}
          progress={getItemProgress(coverItem, queueItemMap)}
          reducedMotion={reducedMotion}
          isOffline={isOffline}
          onRetry={() => handleRetry(coverItem.id)}
          retryLabel={`Retry upload for cover ${isCoverVideo ? 'video' : 'photo'}`}
        />

        {coverCanRemove && (
          <Pressable
            style={styles.coverRemoveBtn}
            onPress={() => handleRemove(coverItem.id)}
            accessibilityRole="button"
            accessibilityLabel={`${removeLabel} cover ${isCoverVideo ? 'video' : 'photo'}`}
          >
            <AppIcon name="close" size={20} color="scrimTextPrimary" accessible={false} glyphStyle={styles.mediaGlyph} />
          </Pressable>
        )}

        {coverEditable && (
          <Pressable
            style={styles.coverEditBtn}
            onPress={() => { void handleEditItem(coverItem.id); }}
            accessibilityRole="button"
            accessibilityLabel="Edit cover photo"
          >
            <View style={styles.editScrim}>
              <AppIcon name="edit" size={28} color="textInverse" accessible={false} />
            </View>
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

      {/* ── Quiet action row ── */}
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
          <AppIcon name="camera" size={16} color="textMuted" accessible={false} />
          <Text style={styles.studioActionText}>Take photo</Text>
        </Pressable>
      </View>

      {/* Overall media validation error (not asset-specific) */}
      {errorText ? (
        <Text style={styles.errorText}>{errorText}</Text>
      ) : null}

      {/* ── Crop sheet ── */}
      {cropSheetUri && cropTarget && (
        <CreatorCropSheet
          visible
          imageUri={cropSheetUri}
          focalPoint={cropTarget.focalPoint}
          onFocalPointChange={handleFocalChange}
          onClose={() => {
            setCropSheetUri(null);
            setCropTargetId(null);
          }}
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
    marginBottom: Space.xs },
  emptyLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
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
  /* ── thumbnails (inside SortablePhotoStrip) ── */
  thumbContent: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative' },
  thumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md },
  thumbVideoTile: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.md,
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
  /* Edit affordance — 28pt glyph on a media-contrast scrim circle,
     44pt hit target (bottom-right). */
  thumbEditBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  editScrim: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
