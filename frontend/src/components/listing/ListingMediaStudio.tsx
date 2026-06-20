import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import { SortablePhotoStrip } from '../SortablePhotoStrip';
import { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import { UploadQueueItem } from '../../services/mediaUploadQueue';
import { isVideoUri } from '../../utils/media';

const { width: SCREEN_W } = Dimensions.get('window');
const COVER_H = Math.round(SCREEN_W * 10 / 16);
const THUMB_SIZE = 72;

interface ListingMediaStudioProps {
  photos: string[];
  mediaDraftItems: ListingMediaDraftItem[];
  queueItems: UploadQueueItem[];
  maxCount: number;
  errorText?: string;
  onPickFromLibrary: () => void;
  onPickFromCamera: () => void;
  onReorder: (newOrder: string[]) => void;
  onRemovePhoto: (index: number) => void;
}

function getMediaStatus(
  uri: string,
  mediaDraftItems: ListingMediaDraftItem[],
  queueItems: UploadQueueItem[]
): 'draft' | 'pending' | 'preparing' | 'uploading' | 'uploaded' | 'failed' | 'cancelled' | null {
  const draft = mediaDraftItems.find((m) => m.uri === uri);
  if (draft) {
    if (draft.status === 'uploaded') return 'uploaded';
    if (draft.status === 'failed') return 'failed';
    if (draft.status === 'uploading') return 'uploading';
    if (draft.status === 'pending') return 'pending';
    if (draft.status === 'draft') return 'draft';
  }
  const queueItem = queueItems.find((q) => q.asset.uri === uri);
  if (queueItem) {
    return queueItem.state;
  }
  return null;
}

export function ListingMediaStudio({
  photos,
  mediaDraftItems,
  queueItems,
  maxCount,
  errorText,
  onPickFromLibrary,
  onPickFromCamera,
  onReorder,
  onRemovePhoto,
}: ListingMediaStudioProps) {
  if (photos.length === 0) {
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

  const coverUri = photos[0];
  const coverStatus = getMediaStatus(coverUri, mediaDraftItems, queueItems);
  const isCoverVideo = isVideoUri(coverUri);

  return (
    <View style={styles.container}>
      {/* Large cover preview */}
      <View style={styles.coverWrap}>
        <Image source={{ uri: coverUri }} style={styles.coverImage} resizeMode="cover" />

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
          <Text style={styles.countText}>{photos.length} / {maxCount}</Text>
        </View>

        {/* Remove cover */}
        <Pressable
          style={styles.coverRemoveBtn}
          onPress={() => onRemovePhoto(0)}
          accessibilityRole="button"
          accessibilityLabel="Remove cover photo"
        >
          <Ionicons name="close-circle" size={22} color="#fff" />
        </Pressable>

        {/* Cover upload status overlay */}
        {coverStatus === 'uploading' && (
          <View style={styles.coverStatusOverlay}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
        {coverStatus === 'failed' && (
          <View style={styles.coverFailedOverlay}>
            <Ionicons name="warning" size={16} color="#fff" />
            <Text style={styles.coverFailedText}>Upload failed</Text>
          </View>
        )}
      </View>

      {/* Thumbnail rail with per-item status */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbScroll}
      >
        {photos.map((uri, index) => {
          if (index === 0) return null;
          const status = getMediaStatus(uri, mediaDraftItems, queueItems);
          const isVideo = isVideoUri(uri);
          return (
            <View key={`thumb_${index}_${uri}`} style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />

              {isVideo && (
                <View style={styles.thumbVideoBadge}>
                  <Ionicons name="videocam" size={10} color="#fff" />
                </View>
              )}

              {/* Per-item status overlay */}
              {status === 'uploading' && (
                <View style={styles.thumbStatusOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
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
                </View>
              )}

              {/* Remove button */}
              <Pressable
                style={styles.thumbRemoveBtn}
                onPress={() => onRemovePhoto(index)}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          );
        })}

        {/* Add more button */}
        {photos.length < maxCount && (
          <Pressable
            style={styles.thumbAddBtn}
            onPress={onPickFromLibrary}
            accessibilityRole="button"
            accessibilityLabel="Add more photos"
          >
            <Ionicons name="add" size={24} color={Colors.textMuted} />
          </Pressable>
        )}
      </ScrollView>

      {/* Camera action */}
      <View style={styles.studioActions}>
        <Pressable
          style={styles.studioActionBtn}
          onPress={onPickFromCamera}
          accessibilityRole="button"
          accessibilityLabel="Take photo with camera"
        >
          <Ionicons name="camera-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.studioActionText}>Camera</Text>
        </Pressable>
      </View>

      {/* Failed items retry/remove actions */}
      {mediaDraftItems.filter((m) => m.status === 'failed').length > 0 && (
        <View style={styles.failedItemsRow}>
          {mediaDraftItems
            .filter((m) => m.status === 'failed')
            .map((m) => (
              <View key={`failed_${m.id}`} style={styles.failedItemChip}>
                <Ionicons name="warning-outline" size={12} color={Colors.danger} />
                <Text style={styles.failedItemText} numberOfLines={1}>
                  {m.error || 'Upload failed'}
                </Text>
              </View>
            ))}
        </View>
      )}

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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFailedOverlay: {
    position: 'absolute',
    bottom: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,59,48,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  coverFailedText: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  thumbScroll: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Colors.surfaceAlt,
  },
  thumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
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
  thumbStatusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: 'rgba(255,59,48,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveBtn: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbAddBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  studioActions: {
    paddingHorizontal: Space.md,
    paddingVertical: 6,
  },
  studioActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  studioActionText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  failedItemsRow: {
    paddingHorizontal: Space.md,
    paddingVertical: 4,
    gap: 4,
  },
  failedItemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,59,48,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  failedItemText: {
    flex: 1,
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.danger,
  },
  errorText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    paddingHorizontal: Space.md,
    paddingTop: 4,
  },
});
