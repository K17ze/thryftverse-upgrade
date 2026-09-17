/**
 * MediaBrowserSheet — dedicated media browser component.
 *
 * Extracted from CreatorAssetPicker's monolithic MediaPicker (spec 08_MEDIA_TOOLCHAIN).
 * This is a reusable, self-contained media browser that can be used by:
 *   1. Creator entry (initial asset selection)
 *   2. Add media flow (adding more assets to an existing project)
 *   3. Replace media flow (replacing a specific layer's asset)
 *
 * Features:
 *   - Recents / Albums / Photos / Videos tabs
 *   - Ordered multi-select (tap to select, tap again to deselect, show order number)
 *   - Large preview (long-press thumbnail)
 *   - Video duration overlay
 *   - Camera tile (first item, opens camera)
 *   - Limited-library state (iOS 14+ / Android 14+ selected-photos-only)
 *   - Truthful permission recovery (denied → clear message + Open Settings)
 *   - Progressive thumbnail loading via expo-image
 *   - FlashList virtualization for performance
 *   - Selection count badge
 *   - Confirm button (disabled when 0 selected)
 *
 * Visual design:
 *   - Full-screen sheet (slides up from bottom)
 *   - Top bar: title, selection count, close button
 *   - Tab bar: Recents | Albums | Photos | Videos
 *   - Grid: 3 columns of square thumbnails, 4pt gap, 8pt radius
 *   - Selected: 2pt brand border + selection order number badge
 *   - Video: duration overlay at bottom
 *   - Camera tile: first position, camera icon + "Camera" label
 *   - Bottom bar: "Add N" confirm button (primary, full width)
 *   - Permission denied: centered message + "Open Settings" button
 *   - Empty: centered "No photos available" message
 *
 * Sub-components live in sibling files (pure extraction):
 *   mediaBrowserTypes.ts    — shared types, constants, formatDuration
 *   mediaBrowserStyles.ts   — createStyles + MediaBrowserStyles
 *   MediaBrowserSkeleton.tsx— SkeletonBlock, MediaGridSkeleton
 *   MediaGridItem.tsx       — MediaGridItem, CameraTile
 *   MediaBrowserStates.tsx  — permission/load-error/empty states
 *   MediaPreviewModal.tsx   — LargePreviewModal (long-press preview)
 *   AlbumListView.tsx       — AlbumRow, AlbumListView
 *   MediaTabBar.tsx         — tab row + animated indicator
 *   MediaBrowserChrome.tsx  — SheetHeader, LimitedAccessBanner, ConfirmBottomBar
 *   MediaGrid.tsx           — limited banner + FlashList
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  useWindowDimensions } from 'react-native';
import type { ListRenderItem } from '@shopify/flash-list';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Space } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { SheetContainer } from '../../shared/CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useToast } from '../../../context/ToastContext';
import {
  useSharedValue,
  withSpring } from 'react-native-reanimated';
import {
  GRID_COLUMNS,
  MAX_VIDEO_DURATION_MS,
  type GridItem,
  type MediaAsset,
  type MediaBrowserSheetProps,
  type MediaTab,
  type SelectedAsset,
  type TabLayoutMap } from './mediaBrowserTypes';
import { createStyles } from './mediaBrowserStyles';
import { MediaGridSkeleton } from './MediaBrowserSkeleton';
import { CameraTile, MediaGridItem } from './MediaGridItem';
import {
  MediaEmptyState,
  MediaLoadErrorState,
  PermissionDeniedState } from './MediaBrowserStates';
import { LargePreviewModal } from './MediaPreviewModal';
import { AlbumListView } from './AlbumListView';
import { MediaTabBar } from './MediaTabBar';
import { ConfirmBottomBar, SheetHeader } from './MediaBrowserChrome';
import { MediaGrid } from './MediaGrid';

// Re-exported so existing consumers (`index.ts`) keep their import path.
export type { MediaBrowserSheetProps, SelectedAsset };

// ── Main component ──────────────────────────────────────────────────

export function MediaBrowserSheet({
  visible,
  onClose,
  onConfirm,
  maxSelections,
  title = 'Select photos',
  showCameraTile = true,
  allowVideos = true }: MediaBrowserSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();
  const toast = useToast();

  // Live window width so the thumbnail grid responds to rotation and
  // multi-window changes (not frozen at module load — the former
  // `Dimensions.get('window')` at module level was a frozen-dimension defect).
  const { width: screenWidth } = useWindowDimensions();
  const thumbSize = Math.floor(
    (screenWidth - Space.md * 2 - Space.xs * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );

  const styles = React.useMemo(() => createStyles(colors, thumbSize), [colors, thumbSize]);

  const [status, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Ordered selection — preserved as an array so tap order is deterministic.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<MediaTab>('recents');
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const cursorRef = useRef<string | undefined>(undefined);
  const mountedRef = useRef(true);

  // ── Album/source model ──
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);

  // Reset selection when the sheet is closed/reopened
  useEffect(() => {
    if (!visible) {
      setSelectedIds([]);
      setActiveTab('recents');
      setActiveAlbumId(null);
      setPreviewAsset(null);
    }
  }, [visible]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load albums when permission is granted
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
        // Albums are optional — the grid still works with "all photos".
      });
    return () => { cancelled = true; };
  }, [status?.granted]);

  // ── Tab indicator animation ──
  const tabIndicatorXSV = useSharedValue(0);
  const tabIndicatorWidthSV = useSharedValue(0);
  const tabLayoutsRef = useRef<TabLayoutMap>({});

  // ── Load media from the device library ──
  const loadRecentMedia = useCallback(
    async (reset: boolean) => {
      if (reset) {
        setIsLoading(true);
        setLoadError(false);
        cursorRef.current = undefined;
      } else {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
      }

      try {
        const opts: MediaLibrary.AssetsOptions = {
          first: 60,
          mediaType: allowVideos ? ['photo', 'video'] : ['photo'],
          sortBy: [['creationTime', false]] };
        if (!reset && cursorRef.current) {
          opts.after = cursorRef.current;
        }
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
          // to milliseconds at the boundary.
          durationMs: a.duration != null ? Math.round(a.duration * 1000) : undefined,
          filename: a.filename }));

        setAssets((prev) => (reset ? mapped : [...prev, ...mapped]));
        cursorRef.current = page.endCursor;
        setHasMore(page.hasNextPage);
      } catch {
        if (reset) setAssets([]);
        setLoadError(true);
        setHasMore(false);
      } finally {
        if (mountedRef.current) {
          if (reset) setIsLoading(false);
          else setLoadingMore(false);
        }
      }
    },
    [hasMore, loadingMore, activeAlbumId, allowVideos],
  );

  // Load/reload media when permission is granted or album changes
  useEffect(() => {
    if (status && status.granted && activeTab !== 'albums') {
      loadRecentMedia(true);
    }
  }, [status, loadRecentMedia, activeTab]);

  // ── Tab switch with spring indicator ──
  const handleTabSwitch = useCallback(
    (tab: MediaTab) => {
      if (tab === activeTab) return;
      haptic.selection();
      setActiveTab(tab);
      const layout = tabLayoutsRef.current[tab];
      if (layout) {
        if (reduceMotion) {
          tabIndicatorXSV.value = layout.x;
          tabIndicatorWidthSV.value = layout.width;
        } else {
          tabIndicatorXSV.value = withSpring(layout.x, spring.tap);
          tabIndicatorWidthSV.value = withSpring(layout.width, spring.tap);
        }
      }
    },
    [activeTab, haptic, reduceMotion, tabIndicatorXSV, tabIndicatorWidthSV, spring],
  );

  const handleSelectAlbum = useCallback(
    (albumId: string | null) => {
      haptic.selection();
      setActiveAlbumId(albumId);
      setActiveTab('recents');
    },
    [haptic],
  );

  // ── Filter assets by tab ──
  const filteredAssets = useMemo(() => {
    if (activeTab === 'photos') return assets.filter((a) => a.mediaType === 'image');
    if (activeTab === 'videos') return assets.filter((a) => a.mediaType === 'video');
    // 'recents' shows everything (already scoped to album if activeAlbumId set)
    return assets;
  }, [assets, activeTab]);

  // ── Toggle selection with video preflight ──
  const toggleSelect = useCallback(
    (asset: MediaAsset) => {
      if (asset.mediaType === 'video') {
        if (!allowVideos) return;
        if (asset.durationMs != null && asset.durationMs > MAX_VIDEO_DURATION_MS) {
          haptic.medium();
          toast.show('Video is too long. Maximum 60 seconds.', 'error');
          return;
        }
      }
      haptic.selection();
      setSelectedIds((prev) => {
        if (prev.includes(asset.id)) {
          return prev.filter((id) => id !== asset.id);
        }
        if (maxSelections != null && prev.length >= maxSelections) return prev;
        return [...prev, asset.id];
      });
    },
    [haptic, maxSelections, allowVideos, toast],
  );

  // ── Confirm selection ──
  const handleConfirm = useCallback(() => {
    if (selectedIds.length === 0) return;
    haptic.light();
    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const selected: SelectedAsset[] = selectedIds
      .map((id) => assetMap.get(id))
      .filter((a): a is MediaAsset => !!a)
      .map((a) => ({
        uri: a.uri,
        mediaType: a.mediaType,
        width: a.width,
        height: a.height,
        durationMs: a.durationMs,
        filename: a.filename }));
    onConfirm(selected);
    onClose();
  }, [selectedIds, assets, onConfirm, onClose, haptic]);

  // ── Camera capture ──
  const handleTakePhoto = useCallback(async () => {
    haptic.light();
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9 });
    if (!result.canceled && result.assets.length > 0) {
      const captured: SelectedAsset = {
        uri: result.assets[0].uri,
        mediaType: 'image',
        width: result.assets[0].width,
        height: result.assets[0].height,
        filename: result.assets[0].fileName ?? undefined };
      onConfirm([captured]);
      onClose();
    }
  }, [onConfirm, onClose, haptic]);

  const handleOpenSettings = useCallback(async () => {
    const { Linking } = await import('react-native');
    Linking.openSettings();
  }, []);

  // ── Limited-access management (iOS 14+ / Android 14+ picker) ──
  const handleManageLimitedAccess = useCallback(async () => {
    try {
      await MediaLibrary.presentPermissionsPickerAsync();
      loadRecentMedia(true);
    } catch {
      handleOpenSettings();
    }
  }, [loadRecentMedia, handleOpenSettings]);

  const selectedCount = selectedIds.length;

  // ── FlashList renderItem ──
  const renderItem: ListRenderItem<GridItem> = useCallback(
    ({ item }) => {
      if (item === 'camera') {
        return <CameraTile onPress={handleTakePhoto} colors={colors} styles={styles} />;
      }
      const asset = item as MediaAsset;
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
    },
    [colors, handleTakePhoto, toggleSelect, selectedIds, styles],
  );

  const gridData: GridItem[] = useMemo(() => {
    const data: GridItem[] = [];
    if (showCameraTile && activeTab !== 'videos') data.push('camera');
    data.push(...filteredAssets);
    return data;
  }, [filteredAssets, showCameraTile, activeTab]);

  // ── Permission states (after all hooks) ──
  if (!status) {
    return (
      <SheetContainer visible={visible} onClose={onClose} maxHeight={0.95}>
        <SheetHeader title={title} onClose={onClose} colors={colors} styles={styles} />
        <View style={styles.centerState}>
          <MediaGridSkeleton />
        </View>
      </SheetContainer>
    );
  }

  if (!status.granted && !status.canAskAgain) {
    return (
      <SheetContainer visible={visible} onClose={onClose} maxHeight={0.95}>
        <SheetHeader title={title} onClose={onClose} colors={colors} styles={styles} />
        <PermissionDeniedState
          icon="lock-closed-outline"
          title="Photo access needed"
          message="Allow access to pick media."
          ctaLabel="Open settings"
          onCta={handleOpenSettings}
          colors={colors}
          styles={styles}
        />
      </SheetContainer>
    );
  }

  if (!status.granted) {
    return (
      <SheetContainer visible={visible} onClose={onClose} maxHeight={0.95}>
        <SheetHeader title={title} onClose={onClose} colors={colors} styles={styles} />
        <PermissionDeniedState
          icon="images-outline"
          title="Access your photos"
          message="Allow access to see your photos."
          ctaLabel="Allow access"
          onCta={() => requestPermission()}
          colors={colors}
          styles={styles}
        />
      </SheetContainer>
    );
  }

  // ── Main media browser ──
  return (
    <>
      <SheetContainer
        visible={visible}
        onClose={selectedCount > 0 ? () => setSelectedIds([]) : onClose}
        maxHeight={0.95}
      >
        {/* Top bar: title + close. The selection count is shown in exactly
            one place — the confirm button ("Next (N)") — to avoid the
            label-everything AI-tell of restating the count in the title, a
            badge, and the button (AGENTS.md §4). The title stays as the
            static sheet title regardless of selection state. */}
        <SheetHeader title={title} onClose={onClose} colors={colors} styles={styles} />

        {/* Tab bar: Recents | Albums | Photos | Videos */}
        <MediaTabBar
          activeTab={activeTab}
          allowVideos={allowVideos}
          onTabPress={handleTabSwitch}
          tabIndicatorXSV={tabIndicatorXSV}
          tabIndicatorWidthSV={tabIndicatorWidthSV}
          tabLayoutsRef={tabLayoutsRef}
          colors={colors}
          styles={styles}
        />

        {/* Content area */}
        {activeTab === 'albums' ? (
          <AlbumListView
            albums={albums}
            activeAlbumId={activeAlbumId}
            onSelectAlbum={handleSelectAlbum}
            colors={colors}
            styles={styles}
          />
        ) : isLoading ? (
          <MediaGridSkeleton />
        ) : loadError && filteredAssets.length === 0 ? (
          <MediaLoadErrorState
            onRetry={() => { setLoadError(false); loadRecentMedia(true); }}
            colors={colors}
            styles={styles}
          />
        ) : filteredAssets.length === 0 ? (
          <MediaEmptyState
            activeTab={activeTab}
            showCameraTile={showCameraTile}
            onTakePhoto={handleTakePhoto}
            colors={colors}
            styles={styles}
          />
        ) : (
          <MediaGrid
            isLimited={status.accessPrivileges === 'limited'}
            onManageLimitedAccess={handleManageLimitedAccess}
            gridData={gridData}
            renderItem={renderItem}
            loadingMore={loadingMore}
            onEndReached={() => loadRecentMedia(false)}
            colors={colors}
            styles={styles}
          />
        )}

        {/* Bottom bar: confirm button (full width, disabled when 0 selected) */}
        <ConfirmBottomBar
          selectedCount={selectedCount}
          onConfirm={handleConfirm}
          colors={colors}
          styles={styles}
        />
      </SheetContainer>

      {/* Large preview modal (long-press) */}
      <LargePreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} colors={colors} />
    </>
  );
}
