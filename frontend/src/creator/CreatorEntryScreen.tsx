import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Linking,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Typography, Radius, Type, Space } from '../theme/designTokens';
import { createStableId } from '../utils/createStableId';
import type { CreatorLayer } from './composition';
import CreatorCamera from './CreatorCamera';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { useReducedMotion } from '../hooks/useReducedMotion';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

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

const GRID_COLUMNS = 4;

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
  const haptic = useHaptic();

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
    // Get image dimensions to preserve aspect ratio
    RNImage.getSize(uri, (imgW: number, imgH: number) => {
      const imgRatio = imgW / imgH;
      // Fit within canvas while preserving aspect ratio
      const layer: CreatorLayer = {
        id: createStableId('media'),
        type: 'media',
        x: 0.5,
        y: 0.5,
        width: 1,
        height: 1 / imgRatio,
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
      };
      onMediaSelected([layer]);
    }, () => {
      // Fallback: full-bleed if we can't get dimensions
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
      };
      onMediaSelected([layer]);
    });
  }, [onMediaSelected]);

  // ── Gallery selection → create media layers → enter editor ──
  const toggleSelect = useCallback((asset: MediaAsset) => {
    haptic.selection();
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
    }));
    haptic.light();
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
        {/* "Aa" text-mode button — Instagram "Create" pattern, top-right */}
        <Pressable
          style={[styles.textModeBtn, { top: insets.top + 8, right: 12 }]}
          hitSlop={8}
          onPress={() => { haptic.light(); onBlankStart(); }}
          accessibilityLabel="Create text poster"
          accessibilityHint="Starts a blank text poster"
          accessibilityRole="button"
        >
          <Text style={styles.textModeBtnLabel}>Aa</Text>
        </Pressable>
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
        colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']}
        style={[styles.galleryTopBar, { paddingTop: insets.top + 8 }]}
      >
        <Pressable
          style={styles.galleryBackBtn}
          hitSlop={12}
          onPress={() => { haptic.selection(); setView('camera'); }}
          accessibilityLabel="Back to camera"
        >
          <Ionicons name="camera" size={22} color="#fff" />
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
              hitSlop={12}
              onPress={handleAddSelected}
              accessibilityLabel={isPoster ? 'Create story' : 'Create collage'}
            >
              <Text style={styles.addBtnText}>
                {isPoster ? 'Create Story' : 'Create Look'}
              </Text>
            </Pressable>
          )}
          <Pressable style={styles.topIconBtn} hitSlop={12} onPress={() => { haptic.light(); onClose(); }} accessibilityLabel="Close">
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
          <Pressable style={styles.permissionBtn} hitSlop={12} onPress={() => { haptic.light(); requestMediaPerm(); }}>
            <Text style={styles.permissionBtnText}>Allow access</Text>
          </Pressable>
        </View>
      ) : assets.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="images-outline" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.permissionText}>No photos found</Text>
          <Pressable style={styles.blankBtn} hitSlop={12} onPress={() => { haptic.selection(); setView('camera'); }}>
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
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <Pressable
                style={[styles.thumb, { width: thumbSize, height: thumbSize }]}
                hitSlop={12}
                onPress={() => toggleSelect(item)}
                accessibilityLabel={`Select ${item.mediaType}${isSelected ? ', selected' : ''}`}
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
                      <Ionicons name="checkmark" size={16} color="#1a1a1a" />
                    </View>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      {/* Bottom bar — selected preview (premium floating bar with blur) */}
      {selectedCount > 0 && (
        <BlurView
          intensity={25}
          tint="dark"
          style={[styles.selectedBottomBar, { paddingBottom: insets.bottom + Space.sm }]}
        >
          <View style={styles.selectedPreviewBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedPreviewScroll}>
              {assets.filter(a => selectedIds.has(a.id)).map((asset) => (
                <View key={asset.id} style={styles.selectedThumbWrap}>
                  <Image source={{ uri: asset.uri }} style={styles.selectedThumb} resizeMode="cover" />
                  <Pressable
                    style={styles.selectedThumbRemove}
                    onPress={() => { haptic.selection(); toggleSelect(asset); }}
                    accessibilityLabel="Remove from selection"
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.selectedCountText}>
              {selectedCount} of {isPoster ? 10 : 6} selected
            </Text>
          </View>
          <Pressable style={styles.addBtn} hitSlop={12} onPress={handleAddSelected} accessibilityLabel={isPoster ? 'Create story' : 'Create collage'}>
            <Text style={styles.addBtnText}>
              {isPoster ? 'Create Story' : 'Create Look'}
            </Text>
          </Pressable>
        </BlurView>
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
    paddingBottom: Space.sm,
    zIndex: 10,
  },
  galleryBackBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryTitle: {
    fontSize: Type.bodyLarge.size,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  topRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.xxl,
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
    fontFamily: Typography.family.semibold,
    color: '#fff',
    marginTop: 12,
  },
  permissionText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: Space.lg,
    paddingVertical: 12,
    borderRadius: Radius.xxl,
    marginTop: 12,
  },
  permissionBtnText: {
    color: '#000',
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  blankBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  blankBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  // Camera view — "Aa" text-mode button (Instagram "Create" pattern)
  textModeBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  textModeBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontFamily: Typography.family.bold,
  },
  // Gallery grid — edge-to-edge, 2px gap
  grid: {
    paddingHorizontal: 0,
    paddingTop: 60,
  },
  gridRow: {
    gap: 2,
  },
  thumb: {
    position: 'relative',
    overflow: 'hidden',
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
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  videoDuration: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Typography.family.medium,
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  selectionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: '#C9A46A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  // Gallery add button — premium pill
  addBtn: {
    backgroundColor: '#C9A46A',
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.full,
    shadowColor: '#C9A46A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addBtnText: {
    color: '#1a1a1a',
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
  },
  // Selected bottom bar — premium floating bar with blur
  selectedBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: Space.md,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  // Selected preview bar
  selectedPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    paddingHorizontal: 12,
  },
  selectedPreviewScroll: {
    gap: 6,
    alignItems: 'center',
  },
  selectedThumbWrap: {
    position: 'relative',
    width: 48,
    height: 48,
  },
  selectedThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
  },
  selectedThumbRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCountText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    marginLeft: 'auto',
  },
});
