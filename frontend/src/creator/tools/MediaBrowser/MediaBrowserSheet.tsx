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
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  type DimensionValue,
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import {
  Space,
  Radius,
  Type,
  Typography,
  Stroke,
  Control,
  FontFamily,
  Elevation,
} from '../../../theme/designTokens';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../../CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { Motion } from '../../../theme/motionTokens';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';

// ── Types ───────────────────────────────────────────────────────────

/**
 * A media asset selected by the user. Returned via onConfirm in tap order.
 */
export interface SelectedAsset {
  uri: string;
  mediaType: 'image' | 'video';
  width?: number;
  height?: number;
  /** Video duration in milliseconds (normalized at the boundary). */
  durationMs?: number;
  filename?: string;
}

export interface MediaBrowserSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the selected assets in tap order when the user confirms. */
  onConfirm: (assets: SelectedAsset[]) => void;
  /** Maximum number of selectable assets. Default: unlimited. */
  maxSelections?: number;
  /** Sheet title. Default: "Select photos". */
  title?: string;
  /** Show the camera tile at the first grid position. Default: true. */
  showCameraTile?: boolean;
  /** Allow video selection. Default: true. */
  allowVideos?: boolean;
}

// ── Internal media asset (from MediaLibrary) ────────────────────────

interface MediaAsset {
  id: string;
  uri: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  /** Video duration in milliseconds (normalized at the boundary). */
  durationMs?: number;
  filename?: string;
}

// ── Tab model ───────────────────────────────────────────────────────
// "Albums" tab shows a list of device albums; selecting one scopes the
// grid to that album and switches back to the "Recents" tab showing
// only that album's contents.

type MediaTab = 'recents' | 'albums' | 'photos' | 'videos';

const MEDIA_TABS: { key: MediaTab; label: string }[] = [
  { key: 'recents', label: 'Recents' },
  { key: 'albums', label: 'Albums' },
  { key: 'photos', label: 'Photos' },
  { key: 'videos', label: 'Videos' },
];

// ── Grid geometry ───────────────────────────────────────────────────

const GRID_COLUMNS = 3;
// Thumbnail size is derived from the live window width via `useWindowDimensions`
// inside the component (not module-level `Dimensions.get('window')`) so the
// grid responds to rotation and multi-window changes instead of being frozen
// at import time. The hook is called in the sheet component below.

// Max video duration accepted by the downstream editor/upload pipeline.
const MAX_VIDEO_DURATION_MS = 60_000;

// ── SkeletonBlock — one-time shimmer sweep (AGENTS.md §14, §17) ──────
function SkeletonBlock({ width, height, radius }: { width: DimensionValue; height: number; radius?: number }) {
  const { colors } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const shimmerSV = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    shimmerSV.value = 0;
    shimmerSV.value = withTiming(1, { duration: Motion.duration.crawl });
  }, [reduceMotion, shimmerSV]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: colors.surfaceAlt,
    opacity: 0.5 + 0.3 * shimmerSV.value,
  }));

  return (
    <Reanimated.View style={[{ width, height, borderRadius: radius ?? Radius.sm }, style]} />
  );
}

// ── MediaGridSkeleton — 3 columns of square thumbnail skeletons ──────
function MediaGridSkeleton() {
  const rows = 4;
  const { width: screenWidth } = useWindowDimensions();
  const thumbSize = Math.floor(
    (screenWidth - Space.md * 2 - Space.xs * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );
  return (
    <View style={{ paddingHorizontal: Space.md, paddingVertical: Space.sm }}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: Space.xs, marginBottom: Space.xs }}>
          {Array.from({ length: GRID_COLUMNS }).map((_, c) => (
            <SkeletonBlock key={c} width={thumbSize} height={thumbSize} radius={Radius.md} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Duration formatting ─────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

// ── MediaGridItem — spring press feedback + selection badge ─────────

interface MediaGridItemProps {
  asset: MediaAsset;
  isSelected: boolean;
  selectionOrder: number;
  onPress: () => void;
  onLongPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function MediaGridItem({
  asset,
  isSelected,
  selectionOrder,
  onPress,
  onLongPress,
  colors,
  styles,
}: MediaGridItemProps) {
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const pressedSV = useSharedValue(0);
  const badgeScaleSV = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    if (isSelected) {
      badgeScaleSV.value = reduceMotion ? 1 : withSpring(1, spring.success);
    } else {
      badgeScaleSV.value = reduceMotion ? 0 : withSpring(0, spring.tap);
    }
  }, [isSelected, reduceMotion, spring, badgeScaleSV]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pressedSV.value, [0, 1], [1, 0.95], Extrapolation.CLAMP) },
    ],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScaleSV.value }],
    opacity: badgeScaleSV.value,
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => { pressedSV.value = withSpring(1, spring.tap); }}
      onPressOut={() => { pressedSV.value = withSpring(0, spring.tap); }}
      accessibilityLabel={`Select ${asset.mediaType}${isSelected ? `, selected ${selectionOrder}` : ''}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
    >
      <Reanimated.View
        style={[
          styles.mediaGridCell,
          isSelected && { borderColor: colors.brand, borderWidth: Stroke.emphasis },
          pressStyle,
        ]}
      >
        <Image
          source={{ uri: asset.uri }}
          style={styles.mediaGridThumb}
          contentFit="cover"
          transition={120}
          recyclingKey={asset.id}
        />
        {asset.mediaType === 'video' && (
          <View style={styles.mediaGridVideoBadge}>
            <Ionicons name="play" size={IconGrammar.badge} color="#fff" />
            {asset.durationMs != null && (
              <Text style={styles.mediaGridDuration}>
                {formatDuration(asset.durationMs)}
              </Text>
            )}
          </View>
        )}
        {isSelected && (
          <Reanimated.View
            style={[styles.mediaGridSelectionBadge, { backgroundColor: colors.brand }, badgeStyle]}
          >
            <Text style={[styles.mediaGridSelectionText, { color: colors.textInverse }]}>
              {selectionOrder}
            </Text>
          </Reanimated.View>
        )}
      </Reanimated.View>
    </Pressable>
  );
}

// ── StaticStateIcon — no continuous animation (AGENTS.md §17) ───────

function StaticStateIcon({
  name,
  size,
  color,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  size: number;
  color: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

// ── PermissionDeniedState — spring entrance with retry CTA ──────────

interface PermissionDeniedStateProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
  ctaLabel: string;
  onCta: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function PermissionDeniedState({
  icon,
  title,
  message,
  ctaLabel,
  onCta,
  colors,
  styles,
}: PermissionDeniedStateProps) {
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const entranceSV = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (!reduceMotion) {
      entranceSV.value = withDelay(100, withSpring(1, spring.entrance));
    }
  }, [reduceMotion, spring, entranceSV]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entranceSV.value,
    transform: [
      { translateY: interpolate(entranceSV.value, [0, 1], [20, 0], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Reanimated.View style={[styles.centerState, entranceStyle]}>
      <StaticStateIcon name={icon} size={IconGrammar.hero} color={colors.textMuted} />
      <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.stateMessage, { color: colors.textSecondary }]}>{message}</Text>
      <PressScale
        onPress={onCta}
        style={[styles.stateBtn, { backgroundColor: colors.brand }]}
        accessibilityLabel={ctaLabel}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={[styles.stateBtnText, { color: colors.textInverse }]}>{ctaLabel}</Text>
      </PressScale>
    </Reanimated.View>
  );
}

// ── CameraTile — first grid position, opens camera ──────────────────

interface CameraTileProps {
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function CameraTile({ onPress, colors, styles }: CameraTileProps) {
  return (
    <PressScale
      onPress={onPress}
      style={[styles.mediaGridCell, styles.cameraTile, { backgroundColor: colors.brandSubtle }]}
      accessibilityLabel="Take photo with camera"
      accessibilityHint="Opens the camera to capture a new photo"
      hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
    >
      <Ionicons name="camera-outline" size={IconGrammar.hero} color={colors.brand} />
    </PressScale>
  );
}

// ── LargePreviewModal — full-screen preview on long-press ───────────

interface LargePreviewModalProps {
  asset: MediaAsset | null;
  onClose: () => void;
  colors: ThemeColors;
}

function LargePreviewModal({ asset, onClose, colors }: LargePreviewModalProps) {
  if (!asset) return null;
  return (
    <Modal visible={!!asset} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={previewStyles.backdrop} onPress={onClose} accessibilityRole="image">
        <View style={previewStyles.content}>
          <Image
            source={{ uri: asset.uri }}
            style={previewStyles.image}
            contentFit="contain"
            transition={150}
          />
          {asset.mediaType === 'video' && asset.durationMs != null && (
            <View style={previewStyles.durationBadge}>
              <Ionicons name="play" size={IconGrammar.badge} color="#fff" />
              <Text style={previewStyles.durationText}>
                {formatDuration(asset.durationMs)}
              </Text>
            </View>
          )}
        </View>
        <Pressable style={previewStyles.closeBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Close preview" accessibilityRole="button">
          <Ionicons name="close" size={IconGrammar.hero} color="#fff" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const previewStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    height: '80%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    bottom: Space.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
  },
  durationText: {
    color: '#fff',
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: Space.md,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── AlbumRow — loads its own cover thumbnail (first asset in album) ──

interface AlbumRowProps {
  album: MediaLibrary.Album;
  isActive: boolean;
  onSelect: (albumId: string | null) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function AlbumRow({ album, isActive, onSelect, colors, styles }: AlbumRowProps) {
  const [coverUri, setCoverUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    MediaLibrary.getAssetsAsync({ album: album.id, first: 1, mediaType: ['photo', 'video'] })
      .then((result) => {
        if (!cancelled && result.assets[0]) {
          setCoverUri(result.assets[0].uri);
        }
      })
      .catch(() => {
        // Cover is optional — placeholder will render.
      });
    return () => { cancelled = true; };
  }, [album.id]);

  return (
    <Pressable
      style={styles.albumRow}
      onPress={() => onSelect(album.id)}
      accessibilityLabel={`${album.title} album, ${album.assetCount} items`}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <View style={[styles.albumThumb, { backgroundColor: colors.surfaceAlt }]}>
        {coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={styles.albumThumbImage}
            contentFit="cover"
            transition={120}
            recyclingKey={album.id}
          />
        ) : (
          <Ionicons name="images-outline" size={IconGrammar.standard} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.albumRowTextCol}>
        <Text
          style={[
            styles.albumRowText,
            { color: isActive ? colors.brand : colors.textPrimary },
          ]}
          numberOfLines={1}
        >
          {album.title}
        </Text>
        <Text style={[styles.albumRowSubtext, { color: colors.textMuted }]}>
          {album.assetCount} items
        </Text>
      </View>
      {isActive && <Ionicons name="checkmark" size={IconGrammar.metadata} color={colors.brand} />}
    </Pressable>
  );
}

// ── AlbumListView — shown when "Albums" tab is active ───────────────

interface AlbumListViewProps {
  albums: MediaLibrary.Album[];
  activeAlbumId: string | null;
  onSelectAlbum: (albumId: string | null) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function AlbumListView({
  albums,
  activeAlbumId,
  onSelectAlbum,
  colors,
  styles,
}: AlbumListViewProps) {
  if (albums.length === 0) {
    return (
      <View style={styles.centerState}>
        <StaticStateIcon name="folder-open-outline" size={IconGrammar.hero} color={colors.textMuted} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No albums found
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.albumList} contentContainerStyle={styles.albumListContent}>
      <Pressable
        style={styles.albumRow}
        onPress={() => onSelectAlbum(null)}
        accessibilityLabel="All Photos album"
        accessibilityRole="button"
        accessibilityState={{ selected: activeAlbumId === null }}
      >
        <View style={[styles.albumThumb, { backgroundColor: colors.brandSubtle }]}>
          <Ionicons name="images-outline" size={IconGrammar.standard} color={colors.brand} />
        </View>
        <View style={styles.albumRowTextCol}>
          <Text
            style={[
              styles.albumRowText,
              { color: activeAlbumId === null ? colors.brand : colors.textPrimary },
            ]}
          >
            All Photos
          </Text>
          <Text style={[styles.albumRowSubtext, { color: colors.textMuted }]}>
            Everything in your library
          </Text>
        </View>
        {activeAlbumId === null && <Ionicons name="checkmark" size={IconGrammar.metadata} color={colors.brand} />}
      </Pressable>
      {albums.slice(0, 30).map((album) => (
        <AlbumRow
          key={album.id}
          album={album}
          isActive={activeAlbumId === album.id}
          onSelect={onSelectAlbum}
          colors={colors}
          styles={styles}
        />
      ))}
    </ScrollView>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function MediaBrowserSheet({
  visible,
  onClose,
  onConfirm,
  maxSelections,
  title = 'Select photos',
  showCameraTile = true,
  allowVideos = true,
}: MediaBrowserSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { spring } = useMotionConfig();
  const reduceMotion = useReducedMotion();

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
  const tabLayoutsRef = useRef<Record<MediaTab, { x: number; width: number }>>({} as any);

  // ── Load media from the device library ──
  const loadRecentMedia = useCallback(
    async (reset: boolean) => {
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
          mediaType: allowVideos ? ['photo', 'video'] : ['photo'],
          sortBy: [['creationTime', false]],
        };
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
          filename: a.filename,
        }));

        setAssets((prev) => (reset ? mapped : [...prev, ...mapped]));
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
    [haptic, maxSelections, allowVideos],
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
        filename: a.filename,
      }));
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
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      const captured: SelectedAsset = {
        uri: result.assets[0].uri,
        mediaType: 'image',
        width: result.assets[0].width,
        height: result.assets[0].height,
        filename: result.assets[0].fileName ?? undefined,
      };
      onConfirm([captured]);
      onClose();
    }
  }, [onConfirm, onClose, haptic]);

  const handleOpenSettings = useCallback(async () => {
    const { Linking } = await import('react-native');
    Linking.openSettings();
  }, []);

  const selectedCount = selectedIds.length;

  // ── Tab indicator animated style ──
  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorXSV.value }],
    width: tabIndicatorWidthSV.value,
  }));

  // ── FlashList renderItem ──
  type GridItem = MediaAsset | 'camera';

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
    if (showCameraTile) data.push('camera');
    data.push(...filteredAssets);
    return data;
  }, [filteredAssets, showCameraTile]);

  // ── Permission states (after all hooks) ──
  if (!status) {
    return (
      <SheetContainer visible={visible} onClose={onClose} maxHeight={0.95}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
          </PressScale>
        </View>
        <View style={styles.centerState}>
          <MediaGridSkeleton />
        </View>
      </SheetContainer>
    );
  }

  if (!status.granted && !status.canAskAgain) {
    return (
      <SheetContainer visible={visible} onClose={onClose} maxHeight={0.95}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
          </PressScale>
        </View>
        <PermissionDeniedState
          icon="lock-closed-outline"
          title="Photo access needed"
          message="Allow access to your photo library to pick media for your creation."
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
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
          </PressScale>
        </View>
        <PermissionDeniedState
          icon="images-outline"
          title="Access your photos"
          message="We need access to show your recent photos and videos here."
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
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close"
            accessibilityHint="Closes the media browser"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
          </PressScale>
        </View>

        {/* Tab bar: Recents | Albums | Photos | Videos */}
        <View style={styles.tabRow}>
          <Reanimated.View
            style={[styles.tabIndicator, { backgroundColor: colors.brand }, tabIndicatorStyle]}
          />
          {MEDIA_TABS.map((tab) => {
            const active = activeTab === tab.key;
            // Hide the Videos tab when videos are not allowed
            if (tab.key === 'videos' && !allowVideos) return null;
            return (
              <Pressable
                key={tab.key}
                onPress={() => handleTabSwitch(tab.key)}
                onLayout={(e) => {
                  tabLayoutsRef.current[tab.key] = {
                    x: e.nativeEvent.layout.x,
                    width: e.nativeEvent.layout.width,
                  };
                  if (tab.key === 'recents' && tabIndicatorWidthSV.value === 0) {
                    tabIndicatorWidthSV.value = e.nativeEvent.layout.width;
                  }
                }}
                style={styles.tab}
                accessibilityLabel={`Tab ${tab.label}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? colors.textPrimary : colors.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

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
        ) : filteredAssets.length === 0 ? (
          <View style={styles.centerState}>
            <StaticStateIcon name="images-outline" size={IconGrammar.hero} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {activeTab === 'videos'
                ? 'No videos available'
                : activeTab === 'photos'
                  ? 'No photos available'
                  : 'No photos available'}
            </Text>
            {showCameraTile && (
              <PressScale
                onPress={handleTakePhoto}
                style={[styles.stateBtn, { backgroundColor: colors.brand }]}
                accessibilityLabel="Take photo"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.stateBtnText, { color: colors.textInverse }]}>
                  Take photo
                </Text>
              </PressScale>
            )}
          </View>
        ) : (
          <>
            {/* Limited-access banner (iOS 14+ / Android 14+) */}
            {status.accessPrivileges === 'limited' && (
              <Pressable
                style={[styles.limitedBanner, { backgroundColor: colors.surfaceAlt }]}
                onPress={async () => {
                  try {
                    await MediaLibrary.presentPermissionsPickerAsync();
                    loadRecentMedia(true);
                  } catch {
                    handleOpenSettings();
                  }
                }}
                accessibilityLabel="Limited photo access — tap to select more photos"
                accessibilityRole="button"
              >
                <Ionicons name="images-outline" size={IconGrammar.metadata} color={colors.textSecondary} />
                <Text style={[styles.limitedBannerText, { color: colors.textSecondary }]}>
                  Limited access — tap to add more photos
                </Text>
                <Ionicons name="chevron-forward" size={IconGrammar.badge} color={colors.textMuted} />
              </Pressable>
            )}

            {/* Media grid via FlashList */}
            <FlashList
              data={gridData}
              keyExtractor={(item) => (typeof item === 'string' ? item : item.id)}
              renderItem={renderItem}
              numColumns={GRID_COLUMNS}
              contentContainerStyle={styles.gridContent}
              onEndReached={() => loadRecentMedia(false)}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.gridFooter}>
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  </View>
                ) : null
              }
            />
          </>
        )}

        {/* Bottom bar: confirm button (full width, disabled when 0 selected) */}
        <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
          <PressScale
            onPress={handleConfirm}
            disabled={selectedCount === 0}
            style={[
              styles.confirmBtn,
              {
                backgroundColor: selectedCount > 0 ? colors.brand : colors.surfaceAlt,
              },
            ]}
            accessibilityLabel={
              selectedCount > 0
                ? `Next, ${selectedCount} selected`
                : 'Next button — select items first'
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: selectedCount === 0 }}
          >
            <Text
              style={[
                styles.confirmBtnText,
                {
                  color: selectedCount > 0 ? colors.textInverse : colors.textMuted,
                },
              ]}
            >
              {selectedCount > 0 ? `Next (${selectedCount})` : 'Next'}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={IconGrammar.metadata}
              color={selectedCount > 0 ? colors.textInverse : colors.textMuted}
            />
          </PressScale>
        </View>
      </SheetContainer>

      {/* Large preview modal (long-press) */}
      <LargePreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} colors={colors} />
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors, thumbSize: number) {
  return StyleSheet.create({
    // ── Header ──
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    title: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.title.size,
      color: colors.textPrimary,
      flex: 1,
    },
    closeBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: Radius.sm,
    },

    // ── Tab bar ──
    tabRow: {
      flexDirection: 'row',
      paddingHorizontal: Space.md,
      position: 'relative',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tabIndicator: {
      position: 'absolute',
      bottom: 0,
      height: Stroke.emphasis,
      borderRadius: Stroke.emphasis,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.smMd,
      zIndex: 1,
    },
    tabLabel: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyStrong.size,
    },

    // ── Album list ──
    albumList: {
      flex: 1,
    },
    albumListContent: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    albumRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd,
      paddingVertical: Space.xs,
      minHeight: 56,
    },
    albumThumb: {
      width: 48,
      height: 48,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    albumThumbImage: {
      width: '100%',
      height: '100%',
    },
    albumRowTextCol: {
      flex: 1,
      flexDirection: 'column',
      gap: 1,
    },
    albumRowText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.bodyStrong.size,
    },
    albumRowSubtext: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
    },

    // ── Limited-access banner ──
    limitedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.smMd,
      marginHorizontal: Space.md,
      marginBottom: Space.sm,
      borderRadius: Radius.md,
    },
    limitedBannerText: {
      flex: 1,
      fontFamily: Typography.family.medium,
      fontSize: Type.caption.size,
    },

    // ── Media grid ──
    gridContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl,
    },
    mediaGridCell: {
      width: thumbSize,
      height: thumbSize,
      borderRadius: Radius.md,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
      gap: Space.xxs,
    },
    mediaGridThumb: {
      width: '100%',
      height: '100%',
    },
    cameraTile: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    mediaGridVideoBadge: {
      position: 'absolute',
      bottom: Space.xs,
      left: Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radius.sm,
    },
    mediaGridDuration: {
      color: '#fff',
      fontSize: 10,
      fontFamily: Typography.family.semibold,
      letterSpacing: 0.2,
    },
    mediaGridSelectionBadge: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      width: 20,
      height: 20,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      ...Elevation.modal,
    },
    mediaGridSelectionText: {
      fontSize: 11,
      fontFamily: Typography.family.bold,
    },
    gridFooter: {
      paddingVertical: Space.md,
      alignItems: 'center',
    },

    // ── States ──
    centerState: {
      paddingVertical: Space.xxl,
      alignItems: 'center',
      gap: Space.md,
      paddingHorizontal: Space.xl,
    },
    stateTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.title.size,
      marginTop: Space.sm,
    },
    stateMessage: {
      fontFamily: Typography.family.regular,
      fontSize: Type.body.size,
      textAlign: 'center',
      lineHeight: 22,
    },
    stateBtn: {
      paddingHorizontal: Space.lg,
      height: 44,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.sm,
    },
    stateBtnText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
    },
    emptyText: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },

    // ── Bottom bar ──
    bottomBar: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    confirmBtn: {
      height: 50,
      borderRadius: Radius.lg,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: Space.xxs,
    },
    confirmBtnText: {
      fontFamily: FontFamily.semibold,
      fontSize: Type.bodyStrong.size,
    },
  });
}
