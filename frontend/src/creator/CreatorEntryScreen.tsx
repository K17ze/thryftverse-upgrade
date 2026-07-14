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
  Animated,
  GestureResponderEvent,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../theme/designTokens';
import { createStableId } from '../utils/createStableId';
import type { CreatorLayer } from './composition';

// ── Creator Entry Screen — Real Camera-First ───────────────────────
// Modeled on VisualSearchCamera: full-screen live camera viewfinder
// with shutter, flash, flip, and gallery thumbnail.
//
// Poster: 9:16 framing brackets, "New Story" title
// Look: 4:5 framing brackets, "New Collage" title
//
// After capture or gallery selection → enter editor with media loaded.

const SHUTTER_SIZE = 76;
const SHUTTER_INNER = 60;
const GRID_COLUMNS = 3;
const CORNER_STROKE = 3;

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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isPoster = documentType === 'poster';

  // ── Camera state ──
  const cameraRef = useRef<CameraView>(null);
  const [cameraPerm, requestCameraPerm] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;

  // ── Gallery state ──
  const [view, setView] = useState<'camera' | 'gallery'>('camera');
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastImageUri, setLastImageUri] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Thumb size for gallery grid
  const thumbSize = useMemo(
    () => Math.floor((screenWidth - 2 * (GRID_COLUMNS - 1)) / GRID_COLUMNS),
    [screenWidth],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Camera permission ──
  useEffect(() => {
    if (!cameraPerm?.granted && cameraPerm?.canAskAgain) {
      requestCameraPerm().catch(() => {});
    }
  }, [cameraPerm, requestCameraPerm]);

  // ── Load most recent photo for gallery thumbnail ──
  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      if (!mediaPerm?.granted) return;
      try {
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: ['photo', 'video'],
          sortBy: [['creationTime', false]],
          first: 1,
        });
        if (!cancelled && page.assets[0]?.uri) {
          setLastImageUri(page.assets[0].uri);
        }
      } catch {}
    }
    void loadRecent();
    return () => { cancelled = true; };
  }, [mediaPerm]);

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

  // ── Camera actions ──
  const toggleFlash = useCallback(() => setFlash((p) => (p === 'off' ? 'on' : 'off')), []);
  const toggleFacing = useCallback(() => setFacing((p) => (p === 'back' ? 'front' : 'back')), []);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (photo?.uri) {
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
            mediaUri: photo.uri,
            mediaType: 'image',
            contentFit: 'cover',
            opacity: 1,
          },
        } as any;
        onMediaSelected([layer]);
      }
    } catch {}
  }, [onMediaSelected]);

  const handleShutterPress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    takePhoto();
  }, [scaleAnim, takePhoto]);

  const handleTapFocus = useCallback((evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    focusAnim.setValue(0);
    Animated.sequence([
      Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(focusAnim, { toValue: 0, duration: 200, useNativeDriver: true, delay: 400 }),
    ]).start(() => setFocusPoint(null));
  }, [focusAnim]);

  // ── Gallery actions ──
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

  // ── Framing brackets — mode-specific aspect ratio ──
  // Poster: 9:16 (full height, narrow width)
  // Look: 4:5 (slightly shorter)
  const frameAspect = isPoster ? 9 / 16 : 4 / 5;
  const frameHeight = isPoster ? screenHeight : Math.floor(screenWidth / frameAspect);
  const frameWidth = isPoster ? Math.floor(screenHeight * frameAspect) : screenWidth;
  const frameTop = isPoster ? 0 : Math.floor((screenHeight - frameHeight) / 2);
  const frameLeft = isPoster ? Math.floor((screenWidth - frameWidth) / 2) : 0;
  const cornerSize = 36;

  // ═══════════════════════════════════════════════════════════════
  // CAMERA PERMISSION DENIED STATES
  // ═══════════════════════════════════════════════════════════════
  if (!cameraPerm) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

  if (!cameraPerm.granted && !cameraPerm.canAskAgain) {
    return (
      <View style={styles.container}>
        <EntryTopBar title={isPoster ? 'New Story' : 'New Collage'} onClose={onClose} insets={insets} />
        <View style={styles.permissionOverlay}>
          <Ionicons name="camera-outline" size={56} color="rgba(255,255,255,0.4)" />
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionText}>
            Enable camera permission in Settings to capture {isPoster ? 'your story' : 'your collage'}.
          </Text>
          <Pressable style={styles.permissionBtn} onPress={() => Linking.openSettings()}>
            <Text style={styles.permissionBtnText}>Open Settings</Text>
          </Pressable>
          <Pressable
            style={styles.galleryFallbackBtn}
            onPress={() => { setView('gallery'); requestMediaPerm(); }}
          >
            <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.6)" />
            <Text style={styles.galleryFallbackText}>Use gallery instead</Text>
          </Pressable>
          <Pressable style={styles.blankBtn} onPress={onBlankStart}>
            <Text style={styles.blankBtnText}>Start with blank canvas</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!cameraPerm.granted) {
    return (
      <View style={styles.container}>
        <EntryTopBar title={isPoster ? 'New Story' : 'New Collage'} onClose={onClose} insets={insets} />
        <View style={styles.permissionOverlay}>
          <Ionicons name="camera-outline" size={56} color="rgba(255,255,255,0.4)" />
          <Text style={styles.permissionTitle}>Access your camera</Text>
          <Text style={styles.permissionText}>
            Capture photos and videos directly for your {isPoster ? 'story' : 'collage'}.
          </Text>
          <Pressable style={styles.permissionBtn} onPress={() => requestCameraPerm()}>
            <Text style={styles.permissionBtnText}>Allow camera</Text>
          </Pressable>
          <Pressable
            style={styles.galleryFallbackBtn}
            onPress={() => { setView('gallery'); requestMediaPerm(); }}
          >
            <Ionicons name="images-outline" size={20} color="rgba(255,255,255,0.6)" />
            <Text style={styles.galleryFallbackText}>Use gallery instead</Text>
          </Pressable>
          <Pressable style={styles.blankBtn} onPress={onBlankStart}>
            <Text style={styles.blankBtnText}>Start with blank canvas</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // GALLERY VIEW
  // ═══════════════════════════════════════════════════════════════
  if (view === 'gallery') {
    return (
      <View style={styles.container}>
        {/* Top bar with back to camera */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']}
          style={[styles.topBar, { paddingTop: insets.top + 8 }]}
        >
          <Pressable
            style={styles.topIconBtn}
            onPress={() => setView('camera')}
            accessibilityLabel="Back to camera"
          >
            <Ionicons name="camera" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>
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

  // ═══════════════════════════════════════════════════════════════
  // CAMERA VIEW — full-screen live viewfinder
  // ═══════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      {/* Full-screen camera feed with tap-to-focus */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTapFocus}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          mode="picture"
          enableTorch={flash === 'on'}
        />
      </Pressable>

      {/* Focus reticle */}
      {focusPoint && (
        <Animated.View
          style={[
            styles.focusReticle,
            {
              left: focusPoint.x - 30,
              top: focusPoint.y - 30,
              opacity: focusAnim,
              transform: [
                { scale: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) },
              ],
            },
          ]}
        />
      )}

      {/* Framing brackets — mode-specific aspect ratio */}
      <View
        style={{
          position: 'absolute',
          top: frameTop,
          left: frameLeft,
          width: frameWidth,
          height: frameHeight,
        }}
        pointerEvents="none"
      >
        {/* Corner brackets */}
        <View style={[styles.bracket, { borderTopWidth: CORNER_STROKE, borderLeftWidth: CORNER_STROKE, width: cornerSize, height: cornerSize, top: 0, left: 0, borderTopLeftRadius: 12 }]} />
        <View style={[styles.bracket, { borderTopWidth: CORNER_STROKE, borderRightWidth: CORNER_STROKE, width: cornerSize, height: cornerSize, top: 0, right: 0, borderTopRightRadius: 12 }]} />
        <View style={[styles.bracket, { borderBottomWidth: CORNER_STROKE, borderLeftWidth: CORNER_STROKE, width: cornerSize, height: cornerSize, bottom: 0, left: 0, borderBottomLeftRadius: 12 }]} />
        <View style={[styles.bracket, { borderBottomWidth: CORNER_STROKE, borderRightWidth: CORNER_STROKE, width: cornerSize, height: cornerSize, bottom: 0, right: 0, borderBottomRightRadius: 12 }]} />
      </View>

      {/* Top controls */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable style={styles.topIconBtn} onPress={onClose} accessibilityLabel="Close">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        <View style={styles.modePill}>
          <Text style={styles.modeText}>{isPoster ? 'Story' : 'Collage'}</Text>
        </View>

        <View style={styles.topRightRow}>
          <Pressable
            style={styles.topIconBtn}
            onPress={toggleFlash}
            accessibilityLabel={flash === 'on' ? 'Flash on' : 'Flash off'}
          >
            <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Bottom controls */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
        style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}
        pointerEvents="box-none"
      >
        {/* Gallery thumbnail — tap to switch to gallery view */}
        <Pressable
          style={styles.galleryBtn}
          onPress={() => setView('gallery')}
          accessibilityLabel="Open gallery"
        >
          {lastImageUri ? (
            <Image source={{ uri: lastImageUri }} style={styles.galleryThumb} />
          ) : (
            <View style={styles.galleryThumbPlaceholder}>
              <Ionicons name="images-outline" size={22} color="#fff" />
            </View>
          )}
          <Text style={styles.bottomLabel}>Gallery</Text>
        </Pressable>

        {/* Shutter button */}
        <Pressable onPress={handleShutterPress} hitSlop={24} accessibilityLabel="Take photo">
          <Animated.View style={[styles.shutterOuter, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.shutterInner} />
          </Animated.View>
        </Pressable>

        {/* Flip camera */}
        <Pressable
          style={styles.flipBtn}
          onPress={toggleFacing}
          accessibilityLabel="Switch camera"
        >
          <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
          <Text style={styles.bottomLabel}>Flip</Text>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

// ── Top bar for permission states ──────────────────────────────────
function EntryTopBar({ title, onClose, insets }: { title: string; onClose: () => void; insets: { top: number } }) {
  return (
    <LinearGradient
      colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']}
      style={[styles.topBar, { paddingTop: insets.top + 8 }]}
    >
      <Pressable style={styles.topIconBtn} onPress={onClose} accessibilityLabel="Close">
        <Ionicons name="close" size={26} color="#fff" />
      </Pressable>
      <Text style={styles.topTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </LinearGradient>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Permission / center states
  permissionOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  galleryFallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 4,
  },
  galleryFallbackText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  blankBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  blankBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  // Top bar
  topBar: {
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
  topTitle: {
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
  modePill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  // Focus reticle
  focusReticle: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 4,
    pointerEvents: 'none',
  },
  // Framing brackets
  bracket: {
    position: 'absolute',
    borderColor: 'rgba(255,255,255,0.7)',
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  bottomBarGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 16,
  },
  galleryBtn: {
    alignItems: 'center',
    gap: 6,
    width: 64,
  },
  galleryThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  galleryThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  flipBtn: {
    alignItems: 'center',
    gap: 6,
    width: 64,
  },
  bottomLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  // Shutter
  shutterOuter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    borderRadius: SHUTTER_INNER / 2,
    backgroundColor: '#fff',
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
  // Gallery top bar add button
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
});
