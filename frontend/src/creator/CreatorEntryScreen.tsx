import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../theme/ThemeContext';
import { createStableId } from '../utils/createStableId';
import type { CreatorLayer, CreatorDocument } from './composition';

// ── Creator Entry Screen ───────────────────────────────────────────
// Full-screen camera/gallery experience shown when the user first
// enters the creator with no existing draft. This is the Instagram
// pattern: media selection FIRST, then the editor.
//
// The user sees:
// 1. Top bar: Close · "Create [Look/Poster]" · blank
// 2. Large camera capture button (or camera tile in grid)
// 3. 3-column grid of recent photos/videos
// 4. Bottom: "Tap photos to select" hint, multi-select, then "Next"
//
// After selecting media, the user enters the editor with media loaded.

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
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const [status, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  // Thumb size: 3 columns, 2px gap
  const thumbSize = useMemo(
    () => Math.floor((screenWidth - 2 * (GRID_COLUMNS - 1)) / GRID_COLUMNS),
    [screenWidth],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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

  useEffect(() => {
    if (status?.granted) {
      loadRecentMedia(true);
    }
  }, [status, loadRecentMedia]);

  const toggleSelect = useCallback((asset: MediaAsset) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        // Limit selection based on type
        const maxSelect = documentType === 'poster' ? 10 : 6;
        if (next.size >= maxSelect) return prev;
        next.add(asset.id);
      }
      return next;
    });
  }, [documentType]);

  const handleTakePhoto = useCallback(async () => {
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      const asset: MediaAsset = {
        id: createStableId('cam'),
        uri: result.assets[0].uri,
        mediaType: 'image',
        width: result.assets[0].width,
        height: result.assets[0].height,
      };
      // Immediately create a layer and enter the editor
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
          mediaUri: asset.uri,
          mediaType: 'image',
          contentFit: 'cover',
          opacity: 1,
        },
      } as any;
      onMediaSelected([layer]);
    }
  }, [onMediaSelected]);

  const handleNext = useCallback(() => {
    if (selectedIds.size === 0) return;
    const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
    const layers: CreatorLayer[] = selectedAssets.map((asset, i) => ({
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

  // ── Permission states ──
  if (!status) {
    return (
      <View style={styles.container}>
        <View style={[styles.centerState, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

  if (!status.granted && !status.canAskAgain) {
    // Permanently denied
    return (
      <View style={styles.container}>
        <EntryTopBar
          title={documentType === 'poster' ? 'New Story' : 'New Collage'}
          onClose={onClose}
          insets={insets}
        />
        <View style={styles.centerState}>
          <Ionicons name="images-outline" size={56} color="rgba(255,255,255,0.4)" />
          <Text style={styles.permissionTitle}>Photo access needed</Text>
          <Text style={styles.permissionText}>
            Allow access to your photos to select media for your {documentType === 'poster' ? 'story' : 'collage'}.
          </Text>
          <Pressable
            style={styles.permissionBtn}
            onPress={() => MediaLibrary.presentPermissionsPickerAsync?.()}
          >
            <Text style={styles.permissionBtnText}>Open settings</Text>
          </Pressable>
          <Pressable
            style={styles.blankBtn}
            onPress={onBlankStart}
          >
            <Text style={styles.blankBtnText}>Start with blank canvas</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!status.granted) {
    // Undetermined — ask
    return (
      <View style={styles.container}>
        <EntryTopBar
          title={documentType === 'poster' ? 'New Story' : 'New Collage'}
          onClose={onClose}
          insets={insets}
        />
        <View style={styles.centerState}>
          <Ionicons name="images-outline" size={56} color="rgba(255,255,255,0.4)" />
          <Text style={styles.permissionTitle}>Access your photos</Text>
          <Text style={styles.permissionText}>
            Select photos and videos from your library to create your {documentType === 'poster' ? 'story' : 'collage'}.
          </Text>
          <Pressable
            style={styles.permissionBtn}
            onPress={() => requestPermission()}
          >
            <Text style={styles.permissionBtnText}>Allow access</Text>
          </Pressable>
          <Pressable
            style={styles.blankBtn}
            onPress={onBlankStart}
          >
            <Text style={styles.blankBtnText}>Start with blank canvas</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Main grid view ──
  const isPoster = documentType === 'poster';
  const isLook = documentType === 'look';

  return (
    <View style={styles.container}>
      {/* Top bar — different title per mode */}
      <EntryTopBar
        title={isPoster ? 'New Story' : 'New Collage'}
        onClose={onClose}
        insets={insets}
      />

      {/* Mode-specific hero section */}
      {isPoster ? (
        // Poster: video-first, 9:16 preview, story identity
        <View style={[styles.cameraSection, { marginTop: insets.top + 48 }]}>
          <Pressable
            style={styles.cameraBigBtn}
            onPress={handleTakePhoto}
            accessibilityLabel="Take photo or video with camera"
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)']}
              style={styles.cameraBigGradient}
            >
              <Ionicons name="videocam" size={36} color="#fff" />
              <View>
                <Text style={styles.cameraBigText}>Camera</Text>
                <Text style={styles.cameraBigSubtext}>Tap to capture for your story</Text>
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        // Look: collage-first, 4:5 preview, editorial identity
        <View style={[styles.cameraSection, { marginTop: insets.top + 48 }]}>
          <Pressable
            style={styles.cameraBigBtn}
            onPress={handleTakePhoto}
            accessibilityLabel="Take photo with camera"
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)']}
              style={styles.cameraBigGradient}
            >
              <Ionicons name="images" size={36} color="#fff" />
              <View>
                <Text style={styles.cameraBigText}>Camera</Text>
                <Text style={styles.cameraBigSubtext}>Capture items for your collage</Text>
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {/* Section label — different per mode */}
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabelText}>{isPoster ? 'YOUR ROLL' : 'GALLERY'}</Text>
        {selectedCount > 0 && (
          <Text style={styles.sectionLabelCount}>
            {selectedCount} {isPoster ? 'pages' : 'photos'}
          </Text>
        )}
      </View>

      {/* Media grid — 3 columns, edge-to-edge */}
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : assets.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="images-outline" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.permissionText}>No photos found in your library</Text>
          <Pressable style={styles.blankBtn} onPress={onBlankStart}>
            <Text style={styles.blankBtnText}>Start with blank canvas</Text>
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
              <MediaThumb
                asset={item}
                size={thumbSize}
                isSelected={isSelected}
                selectionOrder={selectionOrder}
                onPress={() => toggleSelect(item)}
              />
            );
          }}
        />
      )}

      {/* Bottom bar — different CTA text per mode */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
        style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}
      >
        {selectedCount > 0 ? (
          <Pressable
            style={styles.nextBtn}
            onPress={handleNext}
            accessibilityLabel={isPoster ? 'Next — create story with selected media' : 'Next — create collage with selected media'}
          >
            <Text style={styles.nextBtnText}>{isPoster ? 'Create Story' : 'Create Collage'}</Text>
            <Ionicons name="arrow-forward" size={20} color="#000" />
          </Pressable>
        ) : (
          <View style={styles.bottomBarRow}>
            <Pressable
              style={styles.blankBtn}
              onPress={onBlankStart}
              accessibilityLabel="Start with blank canvas"
            >
              <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.blankBtnText}>Blank canvas</Text>
            </Pressable>
            <Pressable
              style={styles.templateBtn}
              onPress={onBlankStart}
              accessibilityLabel="Browse templates"
            >
              <Ionicons name="grid-outline" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.blankBtnText}>Templates</Text>
            </Pressable>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function EntryTopBar({
  title,
  onClose,
  insets,
}: {
  title: string;
  onClose: () => void;
  insets: { top: number };
}) {
  return (
    <LinearGradient
      colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']}
      style={[styles.topBar, { paddingTop: insets.top + 8 }]}
    >
      <Pressable
        style={styles.topBtn}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={28} color="#fff" />
      </Pressable>
      <Text style={styles.topTitle}>{title}</Text>
      <View style={styles.topBtn} />
    </LinearGradient>
  );
}

function MediaThumb({
  asset,
  size,
  isSelected,
  selectionOrder,
  onPress,
}: {
  asset: MediaAsset;
  size: number;
  isSelected: boolean;
  selectionOrder: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.thumb, { width: size, height: size }]}
      onPress={onPress}
      accessibilityLabel={isSelected ? `Deselect photo ${selectionOrder}` : 'Select photo'}
    >
      <Image
        source={{ uri: asset.uri }}
        style={styles.thumbImage}
        resizeMode="cover"
      />
      {asset.mediaType === 'video' && (
        <View style={styles.videoBadge}>
          <Ionicons name="play" size={12} color="#fff" />
          {asset.duration && (
            <Text style={styles.videoDuration}>
              {Math.floor(asset.duration / 60)}:{String(asset.duration % 60).padStart(2, '0')}
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
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 16,
    zIndex: 10,
  },
  topBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  // Grid
  grid: {
    paddingHorizontal: 0,
  },
  // Camera section
  cameraSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cameraBigBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cameraBigGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cameraBigText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  cameraBigSubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
  },
  // Section label
  sectionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionLabelText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  sectionLabelCount: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
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
  // Center states (permission, empty, loading)
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  blankBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  // Bottom bar
  bottomBar: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  selectionCount: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
    minWidth: 120,
    justifyContent: 'center',
  },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  nextBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
  },
});
