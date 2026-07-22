import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../theme/designTokens';
import { createStableId } from '../utils/createStableId';
import type { CreatorLayer } from './composition';
import CreatorCamera from './CreatorCamera';

// ── Creator Entry Screen ───────────────────────────────────────────
// Camera-first entry for the creator. Modeled on VisualSearchScreen:
//   - When opened, the camera viewfinder is shown immediately
//   - Gallery thumbnail in bottom-left switches to gallery grid
//   - Capture → creates a media layer → enters the editor
//   - Gallery selection → creates media layers → enters the editor
//
// The camera is a dedicated CreatorCamera component (like
// VisualSearchCamera), not inline code. This keeps the entry screen
// thin and the camera component reusable.

const GRID_COLUMNS = 3;

interface MediaAsset {
  id: string;
  uri: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  duration?: number;
}

export interface CreatorEntryScreenProps {
  documentType: 'look' | 'poster';
  onClose: () => void;
  onMediaSelected: (layers: CreatorLayer[]) => void;
  onBlankStart: () => void;
}

export function CreatorEntryScreen({
  documentType,
  onClose,
  onMediaSelected,
  onBlankStart,
}: CreatorEntryScreenProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isPoster = documentType === 'poster';

  // ── View state: 'camera' (default) or 'gallery' ──
  const [view, setView] = useState<'camera' | 'gallery'>('camera');

  // ── Gallery state ──
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  const thumbSize = useMemo(
    () => Math.floor((screenWidth - 2 * (GRID_COLUMNS - 1)) / GRID_COLUMNS),
    [screenWidth],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Gallery: load recent media ──
  const loadRecentMedia = useCallback(async (reset: boolean) => {
    if (reset) {
      setIsLoading(true);
      setCursor(undefined);
    } else {
      if (!hasMore || loadingMore) return;
      setLoadingMore(true);
    }

    try {
      const opts: any = {
        first: 60,
        mediaType: ['photo', 'video'],
        sortBy: [['creationTime', false]],
      };
      if (!reset && cursor) opts.after = cursor;

      const page = await MediaLibrary.getAssetsAsync(opts);
      if (!mountedRef.current) return;

      const mapped: MediaAsset[] = page.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        mediaType: a.mediaType === 'video' ? 'video' : 'image',
        width: a.width,
        height: a.height,
        duration: a.duration ? Math.round(a.duration) : undefined,
      }));

      setAssets((prev) => reset ? mapped : [...prev, ...mapped]);
      setCursor(page.endCursor);
      setHasMore(page.hasNextPage);
    } catch {
      if (reset) setAssets([]);
      setHasMore(false);
    } finally {
      if (mountedRef.current) {
        if (reset) setIsLoading(false);
        else setLoadingMore(false);
      }
    }
  }, [hasMore, loadingMore, cursor]);

  // Load gallery when switching to gallery view
  useEffect(() => {
    if (view === 'gallery' && mediaPerm?.granted && assets.length === 0) {
      loadRecentMedia(true);
    }
  }, [view, mediaPerm, assets.length, loadRecentMedia]);

  // Request media permission when switching to gallery
  useEffect(() => {
    if (view === 'gallery' && !mediaPerm?.granted && mediaPerm?.canAskAgain) {
      requestMediaPerm().catch(() => {});
    }
  }, [view, mediaPerm, requestMediaPerm]);

  // ── Camera capture → create media layer → enter editor ──
  const handleCapture = useCallback((uri: string) => {
    const layer: CreatorLayer = {
      id: createStableId('media'),
      type: 'media',
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      scale: 1,
      rotation: 0,
      zIndex: 0,
      locked: false,
      hidden: false,
      opacity: 1,
      payload: {
        mediaUri: uri,
        mediaType: 'image',
        contentFit: 'cover',
        opacity: 1,
      },
    } as any;
    onMediaSelected([layer]);
  }, [onMediaSelected]);

  // ── Gallery selection → create media layers → enter editor ──
  const toggleSelect = useCallback((asset: MediaAsset) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        const maxSelect = isPoster ? 10 : 6;
        if (next.size >= maxSelect) return prev;
        next.add(asset.id);
      }
      return next;
    });
  }, [isPoster]);

  const handleAddSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const selected = assets.filter((a) => selectedIds.has(a.id));
    const layers: CreatorLayer[] = selected.map((asset, i) => ({
      id: createStableId('media'),
      type: 'media',
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      scale: 1,
      rotation: 0,
      zIndex: i,
      locked: false,
      hidden: false,
      opacity: 1,
      payload: {
        mediaUri: asset.uri,
        mediaType: asset.mediaType,
        contentFit: 'cover',
        videoDurationMs: asset.duration,
        opacity: 1,
      },
    } as any));
    onMediaSelected(layers);
  }, [selectedIds, assets, onMediaSelected]);

  const selectedCount = selectedIds.size;

  // ═══════════════════════════════════════════════════════════════
  // CAMERA VIEW — the default, shown immediately on open
  // Uses the dedicated CreatorCamera component (like VisualSearchCamera)
  // ═══════════════════════════════════════════════════════════════
  if (view === 'camera') {
    return (
      <View style={styles.container}>
        <CreatorCamera
          mode={documentType}
          onCapture={handleCapture}
          onGallery={() => setView('gallery')}
          onClose={onClose}
        />
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // GALLERY VIEW — secondary, accessed via gallery thumbnail
  // ═══════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      {/* Top bar with back to camera */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']}
        style={[styles.galleryTopBar, { paddingTop: insets.top + 8 }]}
      >
        <Pressable
          style={styles.topIconBtn}
          onPress={() => setView('camera')}
          accessibilityLabel="Back to camera"
        >
          <Ionicons name="camera" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.galleryTitle}>
          {selectedCount > 0
            ? `${selectedCount} ${isPoster ? 'pages' : 'photos'}`
            : isPoster ? 'Your Roll' : 'Gallery'}
        </Text>
        <View style={styles.topRightRow}>
          {selectedCount > 0 && (
            <Pressable
              style={styles.addBtn}
              onPress={handleAddSelected}
              accessibilityLabel={isPoster ? 'Create story' : 'Create collage'}
            >
              <Text style={styles.addBtnText}>
                {isPoster ? 'Create Story' : 'Create Collage'}
              </Text>
            </Pressable>
          )}
          <Pressable style={styles.topIconBtn} onPress={onClose} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>

      {/* Gallery grid */}
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : !mediaPerm?.granted ? (
        <View style={styles.centerState}>
          <Ionicons name="images-outline" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.permissionTitle}>Access your photos</Text>
          <Text style={styles.permissionText}>
            Select photos from your library for your {isPoster ? 'story' : 'collage'}.
          </Text>
          <Pressable style={styles.permissionBtn} onPress={() => requestMediaPerm()}>
            <Text style={styles.permissionBtnText}>Allow access</Text>
          </Pressable>
        </View>
      ) : assets.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="images-outline" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.permissionText}>No photos found</Text>
          <Pressable style={styles.blankBtn} onPress={() => setView('camera')}>
            <Text style={styles.blankBtnText}>Use camera instead</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLUMNS}
          onEndReached={() => loadRecentMedia(false)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="rgba(255,255,255,0.4)" /> : null}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.id);
            const selectionOrder = isSelected
              ? Array.from(selectedIds).indexOf(item.id) + 1
              : 0;
            return (
              <Pressable
                style={[styles.thumb, { width: thumbSize, height: thumbSize }]}
                onPress={() => toggleSelect(item)}
                accessibilityLabel={`Select ${item.mediaType}${isSelected ? `, selected ${selectionOrder}` : ''}`}
              >
                <Image source={{ uri: item.uri }} style={styles.thumbImage} resizeMode="cover" />
                {item.mediaType === 'video' && (
                  <View style={styles.videoBadge}>
                    <Ionicons name="play" size={12} color="#fff" />
                    {item.duration && (
                      <Text style={styles.videoDuration}>
                        {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                      </Text>
                    )}
                  </View>
                )}
                {isSelected && (
                  <View style={styles.thumbOverlay}>
                    <View style={styles.selectionBadge}>
                      <Text style={styles.selectionBadgeText}>{selectionOrder}</Text>
                    </View>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      {/* Bottom bar — blank canvas option */}
      {selectedCount === 0 && (
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
          style={[styles.bottomBarGradient, { paddingBottom: insets.bottom + 8 }]}
        >
          <Pressable style={styles.blankBtn} onPress={onBlankStart}>
            <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.6)" />
            <Text style={styles.blankBtnText}>Blank canvas</Text>
          </Pressable>
        </LinearGradient>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Gallery top bar
  galleryTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 10,
  },
  galleryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  topRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Center states
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 12,
  },
  permissionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
  },
  permissionBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
  },
  blankBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  blankBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  // Gallery grid
  grid: {
    paddingHorizontal: 0,
    paddingTop: 60,
  },
  thumb: {
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDuration: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  selectionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionBadgeText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  // Gallery add button
  addBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  // Bottom bar gradient
  bottomBarGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 16,
  },
});
