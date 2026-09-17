import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef } from 'react';
import {
  View,
  Text,
  useWindowDimensions } from 'react-native';
import { type ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { AppIcon } from '../../../components/common/AppIcon';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import {
  IconGrammar } from '../../../theme/designTokens';
import {
  useAppTheme } from '../../../theme/ThemeContext';
import { createStableId } from '../../../utils/createStableId';
import {
  SheetContainer,
  PressScale } from '../../shared/CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { useToast } from '../../../context/ToastContext';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import type { CreatorLayer } from '../../core/projectStore/composition';
import {
  useSharedValue,
  withSpring } from 'react-native-reanimated';
import { baseLayer, createStyles } from './pickerShared';
import {
  MAX_VIDEO_DURATION_MS,
  type MediaAsset,
  type MediaCategory,
  type TabLayoutsRef } from './mediaPickerTypes';
import { MediaGridItem } from './MediaPickerGridItem';
import { MediaPickerTabs } from './MediaPickerTabs';
import { MediaPickerAlbumList } from './MediaPickerAlbumList';
import { MediaPickerGrid } from './MediaPickerGrid';
import { MediaPickerPermissionGate } from './MediaPickerStates';
import { MediaPickerPreview } from './MediaPickerPreview';

// ── Media Picker ───────────────────────────────────────────────────
// The sheet orchestrates state + data loading; the grid, tabs, album
// list, permission gate and preview overlay live in sibling components
// (mediaPickerTypes.ts, MediaPickerGridItem.tsx, MediaPickerTabs.tsx,
// MediaPickerAlbumList.tsx, MediaPickerGrid.tsx, MediaPickerStates.tsx,
// MediaPickerPreview.tsx) — same split conventions as tools/MediaBrowser.

export const MediaPicker = React.memo(function MediaPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show: showToast } = useToast();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();
  const [status, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Long-press preview — shows a transient full-screen preview of the
  // long-pressed asset (iOS Photos peek pattern).
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  // Ordered selection — preserved as an array instead of deriving order
  // from Set iteration semantics (which is not deterministic across JS
  // engines). This ensures the selection order matches the user's tap order.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<MediaCategory>('recent');
  const cursorRef = useRef<string | undefined>(undefined);
  const mountedRef = useRef(true);

  // ── Album/source model ──
  // Queries the device's actual photo albums (iOS smart albums, Android
  // buckets) so the user can browse by source instead of only by media type.
  // Falls back gracefully to "All Photos" when the platform doesn't expose
  // albums or the query fails.
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);

  useEffect(() => {
    if (!status?.granted) return;
    let cancelled = false;
    MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true })
      .then((result) => {
        if (!cancelled && result) {
          setAlbums(result);
        }
      })
      .catch(() => {
        // Albums are optional — the grid still works with the default
        // "all photos" query when album listing is unavailable.
      });
    return () => { cancelled = true; };
  }, [status?.granted]);

  // Spring indicator for category tab
  const tabIndicatorXSV = useSharedValue(0);
  const tabIndicatorWidthSV = useSharedValue(0);
  const tabLayoutsRef: TabLayoutsRef = useRef<Partial<Record<MediaCategory, { x: number; width: number }>>>({});

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load media when permission is granted or album changes
  const loadRecentMedia = useCallback(async (reset: boolean) => {
    if (reset) {
      setIsLoading(true);
      cursorRef.current = undefined;
    } else {
      if (!hasMore || loadingMore) return;
      setLoadingMore(true);
    }

    try {
      const opts: MediaLibrary.AssetsOptions = {
        first: 60,
        mediaType: ['photo', 'video'],
        sortBy: [['creationTime', false]] };
      if (!reset && cursorRef.current) {
        opts.after = cursorRef.current;
      }
      // When an album is selected, scope the query to that album's assets.
      if (activeAlbumId) {
        opts.album = activeAlbumId;
      }

      const page = await MediaLibrary.getAssetsAsync(opts);
      if (!mountedRef.current) return;

      const mapped: MediaAsset[] = page.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        mediaType: a.mediaType === 'video' ? 'video' : 'image',
        width: a.width,
        height: a.height,
        // Legacy expo-media-library returns duration in seconds; normalize
        // to milliseconds at the boundary so all downstream logic uses one
        // consistent unit.
        durationMs: a.duration != null ? Math.round(a.duration * 1000) : undefined }));

      setAssets((prev) => reset ? mapped : [...prev, ...mapped]);
      cursorRef.current = page.endCursor;
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
  }, [hasMore, loadingMore, activeAlbumId]);

  useEffect(() => {
    if (status && status.granted) {
      loadRecentMedia(true);
    }
  }, [status, loadRecentMedia]);

  // ── Pull-to-refresh ──────────────────────────────────────────────
  // Reloads the first page of the media library. Distinct from the initial
  // load: the FlashList keeps its scroll position while the data refreshes.
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadRecentMedia(true);
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, [loadRecentMedia]);

  // ── Category tab switch with spring indicator ────────────────────
  const handleCategorySwitch = useCallback((cat: MediaCategory) => {
    if (cat === 'albums') {
      haptic.selection();
      setShowAlbumPicker((v) => !v);
      return;
    }
    if (cat === activeCategory) return;
    haptic.selection();
    setShowAlbumPicker(false);
    setActiveCategory(cat);
    const layout = tabLayoutsRef.current[cat];
    if (layout) {
      if (reduceMotion) {
        tabIndicatorXSV.value = layout.x;
        tabIndicatorWidthSV.value = layout.width;
      } else {
        tabIndicatorXSV.value = withSpring(layout.x, spring.tap);
        tabIndicatorWidthSV.value = withSpring(layout.width, spring.tap);
      }
    }
  }, [activeCategory, haptic, reduceMotion, tabIndicatorXSV, tabIndicatorWidthSV, spring]);

  // Filter assets by category
  const filteredAssets = useMemo(() => {
    if (activeCategory === 'recent') return assets;
    if (activeCategory === 'photos') return assets.filter(a => a.mediaType === 'image');
    if (activeCategory === 'videos') return assets.filter(a => a.mediaType === 'video');
    return assets;
  }, [assets, activeCategory]);

  const toggleSelect = useCallback((asset: MediaAsset) => {
    // Video preflight — reject videos exceeding the max supported duration
    // before they enter the selection (see MAX_VIDEO_DURATION_MS).
    if (asset.mediaType === 'video') {
      if (asset.durationMs != null && asset.durationMs > MAX_VIDEO_DURATION_MS) {
        haptic.error();
        showToast(`Video is ${Math.floor(asset.durationMs / 1000)}s — max 60s`, 'error');
        return;
      }
    }
    haptic.selection();
    setSelectedIds((prev) => {
      if (prev.includes(asset.id)) {
        return prev.filter((id) => id !== asset.id);
      }
      if (prev.length >= 10) return prev;
      return [...prev, asset.id];
    });
  }, [haptic, showToast]);

  const handleAddSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    haptic.light();
    // Preserve the user's tap order by mapping over the ordered array
    // instead of filtering assets (which would preserve library order).
    const selected = selectedIds
      .map((id) => assets.find((a) => a.id === id))
      .filter((a): a is MediaAsset => !!a);
    selected.forEach((asset, i) => {
      onAddLayer({
        ...baseLayer(createStableId('media'), i),
        type: 'media',
        width: 1,
        height: 1,
        payload: {
          mediaUri: asset.uri,
          mediaType: asset.mediaType,
          contentFit: 'cover',
          videoDurationMs: asset.durationMs,
          opacity: 1 } });
    });
    onClose();
  }, [selectedIds, assets, onAddLayer, onClose, haptic]);

  const handleTakePhoto = useCallback(async () => {
    haptic.light();
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9 });
    if (!result.canceled && result.assets.length > 0) {
      onAddLayer({
        ...baseLayer(createStableId('media'), 0),
        type: 'media',
        width: 1,
        height: 1,
        payload: {
          mediaUri: result.assets[0].uri,
          mediaType: 'image',
          contentFit: 'cover',
          opacity: 1 } });
      onClose();
    }
  }, [onAddLayer, onClose, haptic]);

  const handleOpenSettings = useCallback(async () => {
    const { Linking } = await import('react-native');
    Linking.openSettings();
  }, []);

  // Album row select — haptic + close dropdown + reset to the unfiltered
  // "Recent" category (the album scoping happens inside loadRecentMedia).
  const handleAlbumSelect = useCallback((albumId: string | null) => {
    haptic.selection();
    setActiveAlbumId(albumId);
    setShowAlbumPicker(false);
    setActiveCategory('recent');
  }, [haptic]);

  // Limited-access banner — open the system photo-access picker to let the
  // user expand the granted set, then reload. Falls back to app settings.
  const handleManageLimitedAccess = useCallback(async () => {
    try {
      await MediaLibrary.presentPermissionsPickerAsync();
      loadRecentMedia(true);
    } catch {
      handleOpenSettings();
    }
  }, [loadRecentMedia, handleOpenSettings]);

  const selectedCount = selectedIds.length;

  // ── FlashList renderItem ─────────────────────────────────────────
  const renderItem: ListRenderItem<MediaAsset> = useCallback(({ item }) => {
    const asset = item;
    const isSelected = selectedIds.includes(asset.id);
    const selectionOrder = isSelected ? selectedIds.indexOf(asset.id) + 1 : 0;
    return (
      <MediaGridItem
        asset={asset}
        isSelected={isSelected}
        selectionOrder={selectionOrder}
        onPress={() => toggleSelect(asset)}
        onLongPress={() => setPreviewAsset(asset)}
        colors={colors}
        styles={styles}
      />
    );
  }, [colors, toggleSelect, selectedIds, styles]);

  const gridData: MediaAsset[] = useMemo(() => {
    return filteredAssets;
  }, [filteredAssets]);

  // ── Camera hero header — full-width primary action above the grid ──
  const cameraHero = useMemo(() => (
    <PressScale
      onPress={handleTakePhoto}
      style={styles.mediaCameraHero}
      accessibilityLabel="Take photo with camera"
      accessibilityHint="Opens the camera to capture a new photo"
      accessibilityRole="button"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <AppIcon name="camera-outline" size={IconGrammar.hero} color="textPrimary" opticalCenter={true} accessible={false} />
      <Text style={[styles.mediaCameraHeroLabel, { color: colors.textPrimary }]}>
        Camera
      </Text>
    </PressScale>
  ), [handleTakePhoto, styles, colors]);

  // ── Media grid with multi-select ──

  return (
    <MediaPickerPermissionGate
      status={status}
      onClose={onClose}
      onOpenSettings={handleOpenSettings}
      onRequestPermission={() => requestPermission()}
      colors={colors}
      styles={styles}
    >
      <SheetContainer visible={true} onClose={selectedCount > 0 ? () => { setSelectedIds([]); } : onClose} maxHeight={0.9}>
        <View style={styles.header}>
          <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close picker" accessibilityHint="Closes the picker sheet" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} aria-hidden={true} />
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Select
          </Text>
          <PressScale
            onPress={selectedCount > 0 ? handleAddSelected : onClose}
            style={styles.doneBtn}
            accessibilityLabel={selectedCount > 0 ? `Add ${selectedCount} selected media` : 'Done'}
            accessibilityHint={selectedCount > 0 ? 'Adds the selected media to the canvas' : 'Closes the picker'}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.doneBtnText, { color: selectedCount > 0 ? colors.brand : colors.textMuted }]}>
              Done
            </Text>
          </PressScale>
        </View>

        {/* Album picker dropdown — triggered from the "Albums" tab.
            48pt rows, no thumbnails. Row: album name + count + chevron. */}
        {showAlbumPicker && albums.length > 0 && (
          <MediaPickerAlbumList
            albums={albums}
            activeAlbumId={activeAlbumId}
            onSelectAlbum={handleAlbumSelect}
            colors={colors}
            styles={styles}
          />
        )}

        {/* Category tabs — text-only, 2pt brand underline indicator */}
        <MediaPickerTabs
          activeCategory={activeCategory}
          onSelectCategory={handleCategorySwitch}
          tabLayoutsRef={tabLayoutsRef}
          tabIndicatorXSV={tabIndicatorXSV}
          tabIndicatorWidthSV={tabIndicatorWidthSV}
          colors={colors}
          styles={styles}
        />

        {!showAlbumPicker && (
          <MediaPickerGrid
            isLoading={isLoading}
            isEmpty={filteredAssets.length === 0}
            isLimitedAccess={status?.accessPrivileges === 'limited'}
            onManageLimitedAccess={handleManageLimitedAccess}
            selectedIds={selectedIds}
            assets={assets}
            onToggleSelect={toggleSelect}
            onTakePhoto={handleTakePhoto}
            gridData={gridData}
            renderItem={renderItem}
            onEndReached={() => loadRecentMedia(false)}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            loadingMore={loadingMore}
            header={cameraHero}
            colors={colors}
            styles={styles}
          />
        )}

        {/* ── Long-press preview overlay (iOS Photos peek pattern) ──
            Shows the full-resolution image while the user holds. Dismisses
            on touch up. No chrome — the image is the preview. */}
        {previewAsset && (
          <MediaPickerPreview
            asset={previewAsset}
            onDismiss={() => setPreviewAsset(null)}
            styles={styles}
          />
        )}
      </SheetContainer>
    </MediaPickerPermissionGate>
  );
});
