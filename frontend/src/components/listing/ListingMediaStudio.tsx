import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import { SortablePhotoStrip } from '../SortablePhotoStrip';
import { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import { UploadQueueItem, UploadQueueItemState } from '../../services/mediaUploadQueue';
import { isVideoUri } from '../../utils/media';
import { Video, ResizeMode } from '../compat/Video';

const { width: SCREEN_W } = Dimensions.get('window');
const COVER_H = Math.round(SCREEN_W * 10 / 16);
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

function StatusLabel({ status }: { status: ItemStatus }) {
  switch (status) {
    case 'pending':
      return <Text style={styles.statusLabelText}>Queued</Text>;
    case 'preparing':
      return <Text style={styles.statusLabelText}>Preparing…</Text>;
    case 'uploading':
      return <Text style={styles.statusLabelText}>Uploading…</Text>;
    case 'uploaded':
      return null;
    case 'failed':
      return <Text style={styles.statusLabelFailed}>Failed</Text>;
    case 'cancelled':
      return <Text style={styles.statusLabelText}>Cancelled</Text>;
    default:
      return null;
  }
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
  removeLabel = 'Remove',
  canRemoveItem,
  reorderEnabled = true,
  lockedNote,
}: ListingMediaStudioProps) {
  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyCanvas}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="images-outline" size={36} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Add photos or video</Text>
          <Text style={styles.emptySub}>First photo becomes your cover</Text>

          <View style={styles.emptyActions}>
            <Pressable
              style={styles.emptyPrimaryBtn}
              onPress={onPickFromLibrary}
              accessibilityRole="button"
              accessibilityLabel="Choose from library"
            >
              <Ionicons name="images-outline" size={18} color={Colors.textInverse} style={{ marginRight: 8 }} />
              <Text style={styles.emptyPrimaryText}>Choose from library</Text>
            </Pressable>
            <Pressable
              style={styles.emptySecondaryBtn}
              onPress={onPickFromCamera}
              accessibilityRole="button"
              accessibilityLabel="Take photo with camera"
            >
              <Ionicons name="camera-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.emptySecondaryText}>Camera</Text>
            </Pressable>
          </View>

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

    return (
      <View style={styles.thumbContent}>
        {isVideo ? (
          <View style={styles.thumbVideoTile}>
            <Ionicons name="videocam" size={22} color={Colors.textMuted} />
          </View>
        ) : (
          <Image source={{ uri: displayUri }} style={styles.thumbImage} resizeMode="cover" />
        )}

        {isVideo && (
          <View style={styles.thumbVideoBadge}>
            <Ionicons name="videocam" size={10} color="#fff" />
          </View>
        )}

        {item.id === coverItem.id && (
          <View style={styles.thumbCoverBadge}>
            <Text style={styles.thumbCoverText}>COVER</Text>
          </View>
        )}

        {/* Per-item status overlays */}
        {(status === 'pending' || status === 'preparing' || status === 'uploading') && (
          <View style={styles.thumbStatusOverlay}>
            <ActivityIndicator size="small" color="#fff" />
            <View style={styles.thumbStatusLabel}>
              <StatusLabel status={status} />
            </View>
          </View>
        )}

        {status === 'uploaded' && (
          <View style={styles.thumbUploadedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
          </View>
        )}

        {status === 'failed' && (
          <View style={styles.thumbFailedOverlay}>
            <Ionicons name="warning" size={14} color="#fff" />
            <Pressable
              style={styles.thumbRetryBtn}
              onPress={() => onRetryItem(item.id)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={`Retry upload for ${isVideo ? 'video' : 'photo'} ${index + 1}`}
            >
              <Ionicons name="refresh" size={12} color="#fff" />
              <Text style={styles.thumbRetryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {status === 'cancelled' && (
          <View style={styles.thumbCancelledOverlay}>
            <Ionicons name="ban" size={14} color="#fff" />
            <Text style={styles.thumbCancelledText}>Cancelled</Text>
          </View>
        )}

        {/* Remove button — only for removable items */}
        {canRemove && (
          <Pressable
            style={styles.thumbRemoveBtn}
            onPress={() => onRemoveItem(item.id)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`${removeLabel} ${isVideo ? 'video' : 'photo'} ${index + 1}`}
          >
            <Ionicons name="close" size={12} color="#fff" />
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
          <Image source={{ uri: coverDisplayUri }} style={styles.coverImage} resizeMode="cover" />
        )}

        {/* Cover badge */}
        <View style={styles.coverBadge}>
          <Text style={styles.coverBadgeText}>COVER</Text>
        </View>

        {/* Video indicator */}
        {isCoverVideo && (
          <View style={styles.videoIndicator}>
            <Ionicons name="videocam" size={14} color="#fff" />
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
            onPress={() => onRemoveItem(coverItem.id)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={`${removeLabel} cover ${isCoverVideo ? 'video' : 'photo'}`}
          >
            <Ionicons name="close-circle" size={22} color="#fff" />
          </Pressable>
        )}

        {/* Cover upload status overlay */}
        {(coverStatus === 'pending' || coverStatus === 'preparing' || coverStatus === 'uploading') && (
          <View style={styles.coverStatusOverlay}>
            <ActivityIndicator size="small" color="#fff" />
            <View style={styles.coverStatusLabel}>
              <StatusLabel status={coverStatus} />
            </View>
          </View>
        )}

        {/* Cover failed overlay with Retry + Remove */}
        {coverStatus === 'failed' && (
          <View style={styles.coverFailedOverlay}>
            <Ionicons name="warning" size={16} color="#fff" />
            <Text style={styles.coverFailedText}>Upload failed</Text>
            <Pressable
              style={styles.coverRetryBtn}
              onPress={() => onRetryItem(coverItem.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Retry upload for cover ${isCoverVideo ? 'video' : 'photo'}`}
            >
              <Ionicons name="refresh" size={14} color="#fff" />
              <Text style={styles.coverRetryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Cover cancelled overlay */}
        {coverStatus === 'cancelled' && (
          <View style={styles.coverCancelledOverlay}>
            <Ionicons name="ban" size={16} color="#fff" />
            <Text style={styles.coverCancelledText}>Cancelled</Text>
          </View>
        )}
      </View>

      {/* ── Sortable thumbnail rail ── */}
      <SortablePhotoStrip
        photos={photoUris}
        itemIds={itemIds}
        onReorder={onReorder}
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
            onPress={onPickFromLibrary}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Add more photos from library"
          >
            <Ionicons name="images-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.studioActionText}>Add more</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.studioActionBtn}
          onPress={onPickFromCamera}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Take photo with camera"
        >
          <Ionicons name="camera-outline" size={16} color={Colors.textSecondary} />
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

const styles = StyleSheet.create({
  container: {
    width: SCREEN_W,
  },
  emptyCanvas: {
    width: SCREEN_W,
    height: COVER_H,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginBottom: Space.lg,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  emptyPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.lg,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: Colors.brand,
  },
  emptyPrimaryText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  emptySecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptySecondaryText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  emptyCount: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: Space.md,
  },
  coverWrap: {
    width: SCREEN_W,
    height: COVER_H,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  coverImage: {
    width: SCREEN_W,
    height: COVER_H,
  },
  coverBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  coverBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: '#fff',
    letterSpacing: 0.5,
  },
  videoIndicator: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm + 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  videoText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: '#fff',
  },
  countBadge: {
    position: 'absolute',
    bottom: Space.sm,
    left: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  countText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  coverRemoveBtn: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverStatusOverlay: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  coverStatusLabel: {
    justifyContent: 'center',
  },
  coverFailedOverlay: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,59,48,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  coverFailedText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  coverRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  coverRetryText: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
    color: '#fff',
  },
  coverCancelledOverlay: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  coverCancelledText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  /* ── thumbnail content (inside SortablePhotoStrip) ── */
  thumbContent: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
  },
  thumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 16,
  },
  thumbVideoTile: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbVideoBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCoverBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.brand,
    paddingVertical: 2,
    alignItems: 'center',
  },
  thumbCoverText: {
    color: Colors.background,
    fontSize: 9,
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
    bottom: 4,
    alignItems: 'center',
  },
  statusLabelText: {
    fontSize: 9,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  statusLabelFailed: {
    fontSize: 9,
    fontFamily: Typography.family.semibold,
    color: '#fff',
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
    backgroundColor: 'rgba(255,59,48,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  thumbRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  thumbRetryText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: '#fff',
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
    color: '#fff',
  },
  thumbRemoveBtn: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  studioActionText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    paddingHorizontal: Space.md,
    paddingTop: 4,
  },
  lockedNote: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    paddingHorizontal: Space.md,
    paddingTop: 6,
    textAlign: 'center',
  },
});
