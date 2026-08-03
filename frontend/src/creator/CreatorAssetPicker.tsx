import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { searchListingsFromApi, type ListingSearchResult } from '../services/listingsApi';
import { searchUsers, type UserSearchResult } from '../services/profileApi';
import { useStore } from '../store/useStore';
import { fetchLooksFromApi } from '../services/looksApi';
import { createStableId } from '../utils/createStableId';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import type { CreatorLayer } from './composition';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, runOnJS } from 'react-native-reanimated';

export type AssetPickerMode = 'media' | 'product' | 'mention' | 'look' | 'text' | 'shape' | 'vote' | 'draw' | 'gif' | 'music' | 'quiz' | 'question' | 'emojiSlider' | 'countdown';

export interface CreatorAssetPickerProps {
  visible: boolean;
  mode: AssetPickerMode;
  onClose: () => void;
  onAddLayer: (layer: CreatorLayer) => void;
  editingLayer?: CreatorLayer | null;
}

export function CreatorAssetPicker({ visible, mode, onClose, onAddLayer, editingLayer }: CreatorAssetPickerProps) {
  const haptic = useHaptic();
  if (!visible) return null;

  return (
    <AssetPickerContent mode={mode} onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />
  );
}

function AssetPickerContent({ mode, onClose, onAddLayer, editingLayer }: { mode: AssetPickerMode; onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  switch (mode) {
    case 'media':
      return <MediaPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'product':
      return <ProductPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'mention':
      return <MentionPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'look':
      return <LookPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'text':
      return <TextPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'shape':
      return <ShapePicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'vote':
      return <VotePicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'draw':
      return <DrawPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'gif':
      return <GifPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'music':
      return <MusicPicker onClose={onClose} onAddLayer={onAddLayer} />;
    case 'quiz':
      return <QuizPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'question':
      return <QuestionPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'emojiSlider':
      return <EmojiSliderPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    case 'countdown':
      return <CountdownPicker onClose={onClose} onAddLayer={onAddLayer} editingLayer={editingLayer} />;
    default:
      return null;
  }
}

function PickerShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <SheetContainer visible={true} onClose={onClose} maxHeight={0.85}>
      <KeyboardAwareScrollView contentContainerStyle={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ maxHeight: '100%' }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close picker" hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>
        {children}
      </KeyboardAwareScrollView>
    </SheetContainer>
  );
}

function baseLayer(id: string, zIndex: number): Omit<CreatorLayer, 'type' | 'payload'> {
  return {
    id,
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.4,
    scale: 1,
    rotation: 0,
    zIndex,
    locked: false,
    hidden: false,
    opacity: 1,
  };
}

// ── Media Picker ───────────────────────────────────────────────────

const GRID_COLUMNS = 3;
const { width: SCREEN_W } = Dimensions.get('window');
const THUMB_SIZE = Math.floor((SCREEN_W - Space.md * 2 - Space.xs * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

interface MediaAsset {
  id: string;
  uri: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  duration?: number;
}

function MediaPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [status, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const cursorRef = useRef<string | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load recent media when permission is granted
  const loadRecentMedia = useCallback(async (reset: boolean) => {
    if (reset) {
      setIsLoading(true);
      cursorRef.current = undefined;
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
      if (!reset && cursorRef.current) {
        opts.after = cursorRef.current;
      }

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
  }, [hasMore, loadingMore]);

  useEffect(() => {
    if (status && status.granted) {
      loadRecentMedia(true);
    }
  }, [status, loadRecentMedia]);

  const toggleSelect = useCallback((asset: MediaAsset) => {
    haptic.selection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        if (next.size >= 10) return prev;
        next.add(asset.id);
      }
      return next;
    });
  }, []);

  const handleAddSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    haptic.light();
    const selected = assets.filter((a) => selectedIds.has(a.id));
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
          videoDurationMs: asset.duration,
          opacity: 1,
        },
      });
    });
    onClose();
  }, [selectedIds, assets, onAddLayer, onClose]);

  const handleTakePhoto = useCallback(async () => {
    haptic.light();
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      onAddLayer({
        ...baseLayer(createStableId('media'), 0),
        type: 'media',
        width: 1,
        height: 1,
        payload: {
          mediaUri: result.assets[0].uri,
          mediaType: 'image',
          contentFit: 'cover',
          opacity: 1,
        },
      });
      onClose();
    }
  }, [onAddLayer, onClose]);

  const handlePickVideo = useCallback(async () => {
    haptic.light();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      onAddLayer({
        ...baseLayer(createStableId('media'), 0),
        type: 'media',
        width: 1,
        height: 1,
        payload: {
          mediaUri: result.assets[0].uri,
          mediaType: 'video',
          contentFit: 'cover',
          videoDurationMs: result.assets[0].duration ? Math.round(result.assets[0].duration) : undefined,
          opacity: 1,
        },
      });
      onClose();
    }
  }, [onAddLayer, onClose]);

  const handleOpenSettings = useCallback(async () => {
    const { Linking } = await import('react-native');
    Linking.openSettings();
  }, []);

  const selectedCount = selectedIds.size;

  // ── Hooks that must run on every render (before any early returns) ──
  const renderItem = useCallback(({ item, index }: { item: MediaAsset | 'camera' | 'video'; index: number }) => {
    if (item === 'camera') {
      return (
        <Pressable
          onPress={handleTakePhoto}
          style={[styles.mediaGridCell, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
          accessibilityLabel="Take photo with camera"
          accessibilityRole="button"
          hitSlop={12}
        >
          <Ionicons name="camera-outline" size={28} color={colors.textPrimary} />
        </Pressable>
      );
    }
    if (item === 'video') {
      return (
        <Pressable
          onPress={handlePickVideo}
          style={[styles.mediaGridCell, { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
          accessibilityLabel="Pick video from gallery"
          accessibilityRole="button"
          hitSlop={12}
        >
          <Ionicons name="videocam-outline" size={28} color={colors.textPrimary} />
        </Pressable>
      );
    }
    const asset = item as MediaAsset;
    const isSelected = selectedIds.has(asset.id);
    const selectionOrder = isSelected ? Array.from(selectedIds).indexOf(asset.id) + 1 : 0;
    return (
      <Pressable
        onPress={() => toggleSelect(asset)}
        style={styles.mediaGridCell}
        accessibilityLabel={`Select ${asset.mediaType}${isSelected ? `, selected ${selectionOrder}` : ''}`}
        accessibilityRole="button"
        hitSlop={12}
      >
        <Image
          source={{ uri: asset.uri }}
          style={styles.mediaGridThumb}
          resizeMode="cover"
        />
        {asset.mediaType === 'video' && (
          <View style={styles.mediaGridVideoBadge}>
            <Ionicons name="play" size={14} color="#fff" />
            {asset.duration && (
              <Text style={styles.mediaGridDuration}>
                {Math.floor(asset.duration / 1000)}s
              </Text>
            )}
          </View>
        )}
        {isSelected && (
          <View style={styles.mediaGridSelectedOverlay}>
            <View style={styles.mediaGridSelectionBadge}>
              <Text style={styles.mediaGridSelectionText}>{selectionOrder}</Text>
            </View>
          </View>
        )}
      </Pressable>
    );
  }, [colors, handleTakePhoto, handlePickVideo, toggleSelect, selectedIds]);

  const gridData: (MediaAsset | 'camera' | 'video')[] = useMemo(() => {
    return ['camera', 'video', ...assets];
  }, [assets]);

  // ── Permission states (after all hooks) ──
  if (!status) {
    return (
      <PickerShell title="Add Media" onClose={onClose}>
        <View style={styles.mediaLoadingState}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </PickerShell>
    );
  }

  if (!status.granted && !status.canAskAgain) {
    return (
      <PickerShell title="Add Media" onClose={onClose}>
        <View style={styles.mediaPermissionState}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.mediaPermissionTitle, { color: colors.textPrimary }]}>
            Photo access needed
          </Text>
          <Text style={[styles.mediaPermissionText, { color: colors.textSecondary }]}>
            Allow access to your photo library to pick media for your creation.
          </Text>
          <Pressable
            onPress={handleOpenSettings}
            style={[styles.mediaPermissionBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            hitSlop={12}
          >
            <Text style={[styles.mediaPermissionBtnText, { color: colors.textInverse }]}>Open settings</Text>
          </Pressable>
        </View>
      </PickerShell>
    );
  }

  if (!status.granted) {
    return (
      <PickerShell title="Add Media" onClose={onClose}>
        <View style={styles.mediaPermissionState}>
          <Ionicons name="images-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.mediaPermissionTitle, { color: colors.textPrimary }]}>
            Access your photos
          </Text>
          <Text style={[styles.mediaPermissionText, { color: colors.textSecondary }]}>
            We need access to show your recent photos and videos here.
          </Text>
          <Pressable
            onPress={() => requestPermission()}
            style={[styles.mediaPermissionBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Grant access"
            accessibilityRole="button"
            hitSlop={12}
          >
            <Text style={[styles.mediaPermissionBtnText, { color: colors.textInverse }]}>Allow access</Text>
          </Pressable>
        </View>
      </PickerShell>
    );
  }

  // ── Media grid with multi-select ──

  return (
    <SheetContainer visible={true} onClose={selectedCount > 0 ? () => { setSelectedIds(new Set()); } : onClose} maxHeight={0.9}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {selectedCount > 0 ? `${selectedCount} selected` : 'Add Media'}
        </Text>
        <View style={styles.headerRight}>
          {selectedCount > 0 && (
            <PressScale
              onPress={handleAddSelected}
              style={[styles.addBtn, { backgroundColor: colors.brand }]}
              accessibilityLabel="Add selected media"
              hitSlop={12}
            >
              <Text style={[styles.addBtnText, { color: colors.textInverse }]}>Add</Text>
            </PressScale>
          )}
          <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close picker" hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.mediaLoadingState}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : assets.length === 0 ? (
        <View style={styles.mediaEmptyState}>
          <Ionicons name="images-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.mediaEmptyText, { color: colors.textSecondary }]}>
            No photos found
          </Text>
          <Pressable
            onPress={handleTakePhoto}
            style={[styles.mediaPermissionBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Take photo"
            accessibilityRole="button"
            hitSlop={12}
          >
            <Text style={[styles.mediaPermissionBtnText, { color: colors.textInverse }]}>Take photo</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={gridData}
          keyExtractor={(item, index) => typeof item === 'string' ? item : item.id}
          renderItem={renderItem}
          numColumns={GRID_COLUMNS}
          columnWrapperStyle={styles.mediaGridRow}
          contentContainerStyle={styles.mediaGridContent}
          onEndReached={() => loadRecentMedia(false)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? (
            <View style={styles.mediaGridFooter}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : null}
        />
      )}
    </SheetContainer>
  );
}

// ── Product Picker ─────────────────────────────────────────────────

function ProductPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ListingSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      setIsLoading(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await searchListingsFromApi(trimmed, 50);
      if (reqId !== reqIdRef.current || !mountedRef.current) return;
      setResults(res.items);
      setHasSearched(true);
    } catch (err) {
      if (reqId !== reqIdRef.current || !mountedRef.current) return;
      setError((err as Error).message || 'Search failed');
      setResults([]);
      setHasSearched(true);
    } finally {
      if (reqId === reqIdRef.current && mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const handleRetry = useCallback(() => doSearch(query), [doSearch, query]);

  const handleSelect = useCallback((item: ListingSearchResult) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('product'), 10),
      type: 'product',
      width: 0.2,
      height: 0.1,
      payload: {
        listingId: item.id,
        snapshotTitle: item.title,
        snapshotImageUrl: item.imageUrl ?? undefined,
        snapshotPriceGbp: item.priceGbp,
        availability: 'active',
      },
    });
    onClose();
  }, [onAddLayer, onClose]);

  return (
    <PickerShell title="Add Product" onClose={onClose}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search listings..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search listings"
        />
        {isLoading && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't search listings</Text>
          <Pressable onPress={handleRetry} style={styles.retryBtn} accessibilityLabel="Retry search" accessibilityRole="button" hitSlop={12}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select ${item.title}`} accessibilityRole="button" hitSlop={12}>
              <View style={styles.resultThumb}>
                {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.resultThumbImg} /> : <Ionicons name="pricetag" size={16} color={colors.textSecondary} />}
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultName} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.resultPrice}>£{item.priceGbp.toFixed(0)}</Text>
              </View>
            </Pressable>
          )}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={hasSearched && !isLoading ? <View style={styles.emptyState}><Text style={styles.emptyText}>No listings found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
}

// ── Mention Picker ─────────────────────────────────────────────────

function MentionPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const currentUserId = useStore((state) => state.currentUser?.id);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      setIsSearching(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setIsSearching(true);
    setError(null);
    try {
      const res = await searchUsers(trimmed, 20);
      if (reqId !== reqIdRef.current || !mountedRef.current) return;
      const filtered = currentUserId ? res.filter((u) => u.id !== currentUserId) : res;
      setResults(filtered);
      setHasSearched(true);
    } catch (err) {
      if (reqId !== reqIdRef.current || !mountedRef.current) return;
      setError((err as Error).message || 'Search failed');
      setResults([]);
      setHasSearched(true);
    } finally {
      if (reqId === reqIdRef.current && mountedRef.current) setIsSearching(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const handleRetry = useCallback(() => doSearch(query), [doSearch, query]);

  const handleSelect = useCallback((user: UserSearchResult) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('mention'), 10),
      type: 'mention',
      width: 0.15,
      height: 0.06,
      payload: { userId: user.id, username: user.username },
    });
    onClose();
  }, [onAddLayer, onClose]);

  return (
    <PickerShell title="Add Mention" onClose={onClose}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search users"
        />
        {isSearching && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't search users</Text>
          <Pressable onPress={handleRetry} style={styles.retryBtn} accessibilityLabel="Retry search" accessibilityRole="button" hitSlop={12}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select @${item.username}`} accessibilityRole="button" hitSlop={12}>
              <View style={styles.resultAvatar}>
                {item.avatar ? <Image source={{ uri: item.avatar }} style={styles.resultThumbImg} /> : <Text style={styles.resultAvatarText}>{item.username[0]?.toUpperCase()}</Text>}
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultName}>@{item.username}</Text>
                {item.displayName && <Text style={styles.resultSubtext}>{item.displayName}</Text>}
              </View>
            </Pressable>
          )}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={hasSearched && !isSearching ? <View style={styles.emptyState}><Text style={styles.emptyText}>No users found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
}

// ── Look Picker ────────────────────────────────────────────────────

function LookPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [allLooks, setAllLooks] = useState<Array<{ id: string; caption: string; mediaUrl: string; creatorId: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadLooks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchLooksFromApi({ status: 'published', limit: 120 });
      if (!mountedRef.current) return;
      setAllLooks(res.items
        .filter((l) => l.visibility === 'public' && l.status === 'published')
        .map((l) => ({
          id: l.id,
          caption: l.caption || l.title,
          mediaUrl: l.mediaUrl,
          creatorId: l.creatorId,
        })));
    } catch (err) {
      if (!mountedRef.current) return;
      setError((err as Error).message || 'Failed to load looks');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLooks();
  }, [loadLooks]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allLooks;
    const q = query.trim().toLowerCase();
    return allLooks.filter((l) => l.caption.toLowerCase().includes(q));
  }, [allLooks, query]);

  const handleSelect = useCallback((item: { id: string; caption: string; mediaUrl: string }) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('look'), 10),
      type: 'look',
      width: 0.2,
      height: 0.08,
      payload: { lookId: item.id, snapshotCaption: item.caption, snapshotImageUrl: item.mediaUrl },
    });
    onClose();
  }, [onAddLayer, onClose]);

  return (
    <PickerShell title="Add Look" onClose={onClose}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search looks..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search looks"
        />
        {isLoading && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load looks</Text>
          <Pressable onPress={loadLooks} style={styles.retryBtn} accessibilityLabel="Retry loading looks" accessibilityRole="button" hitSlop={12}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select look ${item.caption}`} accessibilityRole="button" hitSlop={12}>
              <View style={styles.resultAvatar}><Ionicons name="shirt-outline" size={16} color={colors.textSecondary} /></View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultName} numberOfLines={2}>{item.caption}</Text>
              </View>
            </Pressable>
          )}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={!isLoading ? <View style={styles.emptyState}><Text style={styles.emptyText}>No looks found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
}

// ── Text Picker ────────────────────────────────────────────────────
// Instagram 2025-2026 parity: 10 fonts, text effects, background color,
// text animations (typewriter, bounce, fade). Each style label renders
// in its own font (Snapchat pattern).

const TEXT_STYLES: Array<{ key: string; label: string }> = [
  { key: 'clean', label: 'Clean' },
  { key: 'headline', label: 'Headline' },
  { key: 'editorial', label: 'Editorial' },
  { key: 'compact', label: 'Compact' },
  { key: 'handwritten', label: 'Handwritten' },
  { key: 'bubble', label: 'Bubble' },
  { key: 'deco', label: 'Deco' },
  { key: 'poster', label: 'Poster' },
  { key: 'squeeze', label: 'Squeeze' },
  { key: 'signature', label: 'Signature' },
];

// Text effect types (Instagram 2025-2026)
const TEXT_EFFECTS: Array<{ key: string; label: string; icon: string }> = [
  { key: 'none', label: 'None', icon: 'close-circle-outline' },
  { key: 'shadow', label: 'Shadow', icon: 'moon-outline' },
  { key: 'neon', label: 'Neon', icon: 'flash-outline' },
  { key: 'outline', label: 'Outline', icon: 'square-outline' },
  { key: 'glow', label: 'Glow', icon: 'sunny-outline' },
];

// Text animation types (Instagram 2025-2026)
const TEXT_ANIMATIONS: Array<{ key: string; label: string }> = [
  { key: 'none', label: 'None' },
  { key: 'typewriter', label: 'Typewriter' },
  { key: 'bounce', label: 'Bounce' },
  { key: 'fade', label: 'Fade In' },
  { key: 'slide', label: 'Slide Up' },
];

const TEXT_COLORS = ['#ffffff', '#000000', '#9b0202', '#215634', '#06489A', '#C9A46A', '#8A6A3F', '#6B3245', '#E06666', '#B85566'];

const TEXT_BG_COLORS = ['transparent', '#000000', '#ffffff', '#9b0202', '#215634', '#06489A', '#C9A46A', '#6B3245'];

const TEXT_ALIGNMENTS: Array<{ key: 'left' | 'center' | 'right'; icon: string }> = [
  { key: 'left', icon: 'text-outline' },
  { key: 'center', icon: 'text' },
  { key: 'right', icon: 'text-right' },
];

// Text style preview mapping — mirrors CreatorCanvas styleMap
// Instagram 2025-2026: 10 fonts covering clean, bold, editorial,
// compact, handwritten, bubble, deco, poster, squeeze, signature
const TEXT_STYLE_PREVIEW: Record<string, { fontFamily: string; fontSize: number; lineHeight: number }> = {
  clean: { fontFamily: Typography.family.medium, fontSize: Type.body.size, lineHeight: Type.body.size * 1.3 },
  headline: { fontFamily: Typography.family.bold, fontSize: Type.title.size, lineHeight: Type.title.size * 1.15 },
  editorial: { fontFamily: Typography.family.bold, fontSize: Type.bodyEmphasis.size + 2, lineHeight: (Type.bodyEmphasis.size + 2) * 1.2 },
  compact: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, lineHeight: Type.caption.size * 1.3 },
  handwritten: { fontFamily: Typography.family.regular, fontSize: Type.body.size, lineHeight: Type.body.size * 1.35 },
  bubble: { fontFamily: Typography.family.bold, fontSize: Type.bodyEmphasis.size + 4, lineHeight: (Type.bodyEmphasis.size + 4) * 1.2 },
  deco: { fontFamily: Typography.family.bold, fontSize: Type.bodyEmphasis.size, lineHeight: Type.bodyEmphasis.size * 1.3 },
  poster: { fontFamily: Typography.family.bold, fontSize: Type.title.size - 4, lineHeight: (Type.title.size - 4) * 1.1 },
  squeeze: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, lineHeight: Type.body.size * 1.1 },
  signature: { fontFamily: Typography.family.regular, fontSize: Type.bodyEmphasis.size, lineHeight: Type.bodyEmphasis.size * 1.4 },
};

function TextPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isEditing = editingLayer?.type === 'text';
  const existingPayload = isEditing ? (editingLayer as any).payload : null;

  const [text, setText] = useState(existingPayload?.text ?? '');
  const [textStyle, setTextStyle] = useState(existingPayload?.textStyle ?? 'clean');
  const [textColor, setTextColor] = useState(existingPayload?.textColor ?? '#ffffff');
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>(existingPayload?.alignment ?? 'center');
  const [textEffect, setTextEffect] = useState(existingPayload?.textEffect ?? 'none');
  const [textAnimation, setTextAnimation] = useState(existingPayload?.textAnimation ?? 'none');
  const [textBgColor, setTextBgColor] = useState(existingPayload?.backgroundColor ?? 'transparent');

  const handleAdd = useCallback(() => {
    if (!text.trim()) return;
    const payload: any = {
      text: text.trim(),
      textStyle,
      textColor,
      alignment,
      opacity: 1,
      textEffect,
      textAnimation,
      backgroundColor: textBgColor !== 'transparent' ? textBgColor : undefined,
    };
    if (isEditing && editingLayer) {
      onAddLayer({
        ...editingLayer,
        payload: {
          ...editingLayer.payload,
          ...payload,
        },
      } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('text'), 10),
        type: 'text',
        width: 0.6,
        height: 0.1,
        payload,
      });
    }
    onClose();
  }, [text, textStyle, textColor, alignment, textEffect, textAnimation, textBgColor, isEditing, editingLayer, onAddLayer, onClose]);

  return (
    <PickerShell title={isEditing ? 'Edit Text' : 'Add Text'} onClose={onClose}>
      <View style={styles.textPickerBody}>
        {/* Live preview — shows text with selected style + color (Snapchat pattern) */}
        <View style={styles.textPreview}>
          <Text
            style={[
              styles.textPreviewText,
              { color: textColor, textAlign: alignment },
              TEXT_STYLE_PREVIEW[textStyle] ?? TEXT_STYLE_PREVIEW.clean,
            ]}
            numberOfLines={3}
          >
            {text.trim() || 'Your text preview'}
          </Text>
        </View>

        <TextInput
          style={styles.textInput}
          placeholder="Type your text..."
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={200}
          autoFocus
          accessibilityLabel="Text content"
        />

        {/* Style selector — each label rendered in its own style (Snapchat pattern) */}
        <Text style={styles.pickerSectionLabel}>Style</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {TEXT_STYLES.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => { haptic.selection(); setTextStyle(s.key); }}
              style={[styles.styleOption, textStyle === s.key && styles.styleOptionActive]}
              accessibilityLabel={`Text style ${s.label}`}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text
                style={[
                  styles.styleOptionText,
                  textStyle === s.key && styles.styleOptionTextActive,
                  TEXT_STYLE_PREVIEW[s.key] ?? TEXT_STYLE_PREVIEW.clean,
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Color selector */}
        <Text style={styles.pickerSectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {TEXT_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setTextColor(c); }}
              style={[styles.colorOption, { backgroundColor: c }, textColor === c && styles.colorOptionActive]}
              accessibilityLabel={`Text color ${c}`}
              accessibilityRole="button"
              hitSlop={12}
            />
          ))}
        </View>

        {/* Alignment */}
        <Text style={styles.pickerSectionLabel}>Alignment</Text>
        <View style={styles.alignmentRow}>
          {TEXT_ALIGNMENTS.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => { haptic.selection(); setAlignment(a.key); }}
              style={[styles.alignmentOption, alignment === a.key && styles.alignmentOptionActive]}
              accessibilityLabel={`Align ${a.key}`}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Ionicons name={a.icon as any} size={18} color={alignment === a.key ? colors.brand : colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        {/* Text effect — Instagram 2025-2026: shadow, neon, outline, glow */}
        <Text style={styles.pickerSectionLabel}>Effect</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {TEXT_EFFECTS.map((e) => (
            <Pressable
              key={e.key}
              onPress={() => { haptic.selection(); setTextEffect(e.key); }}
              style={[styles.styleOption, textEffect === e.key && styles.styleOptionActive]}
              accessibilityLabel={`Text effect ${e.label}`}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Ionicons name={e.icon as any} size={18} color={textEffect === e.key ? colors.brand : colors.textSecondary} />
              <Text
                style={[
                  styles.styleOptionText,
                  textEffect === e.key && styles.styleOptionTextActive,
                ]}
              >
                {e.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Text animation — Instagram 2025-2026: typewriter, bounce, fade, slide */}
        <Text style={styles.pickerSectionLabel}>Animation</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {TEXT_ANIMATIONS.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => { haptic.selection(); setTextAnimation(a.key); }}
              style={[styles.styleOption, textAnimation === a.key && styles.styleOptionActive]}
              accessibilityLabel={`Text animation ${a.label}`}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text
                style={[
                  styles.styleOptionText,
                  textAnimation === a.key && styles.styleOptionTextActive,
                ]}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Background color — Instagram 2025-2026: colored text background */}
        <Text style={styles.pickerSectionLabel}>Background</Text>
        <View style={styles.colorRow}>
          {TEXT_BG_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => { haptic.selection(); setTextBgColor(c); }}
              style={[
                styles.colorOption,
                { backgroundColor: c === 'transparent' ? 'transparent' : c },
                c === 'transparent' && styles.colorOptionTransparent,
                textBgColor === c && styles.colorOptionActive,
              ]}
              accessibilityLabel={`Background ${c === 'transparent' ? 'none' : c}`}
              accessibilityRole="button"
              hitSlop={12}
            >
              {c === 'transparent' && (
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              )}
            </Pressable>
          ))}
        </View>

        <Pressable onPress={handleAdd} style={[styles.saveBtn, !text.trim() && styles.saveBtnDisabled]} disabled={!text.trim()} accessibilityLabel={isEditing ? 'Update text' : 'Add text'} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Text'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
}

// ── Draw Picker ───────────────────────────────────────────────────
// Instagram/Snapchat parity: freehand drawing with pen, marker,
// highlighter, neon, and eraser. Uses Skia for performant stroke
// rendering and react-native-gesture-handler for pan capture.

const DRAW_TOOLS: Array<{ key: 'pen' | 'marker' | 'highlighter' | 'neon' | 'eraser'; label: string; icon: string }> = [
  { key: 'pen', label: 'Pen', icon: 'create-outline' },
  { key: 'marker', label: 'Marker', icon: 'brush-outline' },
  { key: 'highlighter', label: 'Highlight', icon: 'color-highlight-outline' },
  { key: 'neon', label: 'Neon', icon: 'flash-outline' },
  { key: 'eraser', label: 'Eraser', icon: 'backspace-outline' },
];

const DRAW_COLORS = ['#ffffff', '#000000', '#9b0202', '#215634', '#06489A', '#C9A46A', '#E06666', '#B85566', '#F5D547', '#7B68EE'];
const BRUSH_SIZES = [2, 4, 8, 14, 22];

interface DrawPoint { x: number; y: number; }
interface DrawStroke {
  points: DrawPoint[];
  color: string;
  width: number;
  tool: 'pen' | 'marker' | 'highlighter' | 'neon' | 'eraser';
}

function buildSkiaPath(points: DrawPoint[], canvasW: number, canvasH: number): any {
  if (points.length === 0) return null;
  const path = Skia.Path.Make();
  const first = points[0];
  path.moveTo(first.x * canvasW, first.y * canvasH);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = ((prev.x + curr.x) / 2) * canvasW;
    const midY = ((prev.y + curr.y) / 2) * canvasH;
    path.quadTo(prev.x * canvasW, prev.y * canvasH, midX, midY);
  }
  const last = points[points.length - 1];
  path.lineTo(last.x * canvasW, last.y * canvasH);
  return path;
}

function DrawPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isEditing = editingLayer?.type === 'draw';
  const existingStrokes: DrawStroke[] = isEditing ? (editingLayer as any).payload.strokes ?? [] : [];

  const [strokes, setStrokes] = useState<DrawStroke[]>(existingStrokes);
  const [activeTool, setActiveTool] = useState<'pen' | 'marker' | 'highlighter' | 'neon' | 'eraser'>('pen');
  const [activeColor, setActiveColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(4);
  const [canvasLayout, setCanvasLayout] = useState({ width: 320, height: 400 });

  // Current stroke being drawn
  const currentStroke = useSharedValue<DrawStroke | null>(null);
  const renderTick = useSharedValue(0);

  const panGesture = React.useMemo(() => {
    let currentPoints: DrawPoint[] = [];
    return Gesture.Pan()
      .onBegin((e) => {
        currentPoints = [{ x: e.x / canvasLayout.width, y: e.y / canvasLayout.height }];
        currentStroke.value = {
          points: [...currentPoints],
          color: activeTool === 'eraser' ? '#000000' : activeColor,
          width: activeTool === 'highlighter' ? brushSize * 3 : activeTool === 'neon' ? brushSize * 1.5 : brushSize,
          tool: activeTool,
        };
      })
      .onUpdate((e) => {
        currentPoints.push({ x: e.x / canvasLayout.width, y: e.y / canvasLayout.height });
        currentStroke.value = {
          points: [...currentPoints],
          color: activeTool === 'eraser' ? '#000000' : activeColor,
          width: activeTool === 'highlighter' ? brushSize * 3 : activeTool === 'neon' ? brushSize * 1.5 : brushSize,
          tool: activeTool,
        };
        renderTick.value = renderTick.value + 1;
      })
      .onEnd(() => {
        if (currentPoints.length > 1) {
          runOnJS(commitStroke)({
            points: [...currentPoints],
            color: activeTool === 'eraser' ? '#000000' : activeColor,
            width: activeTool === 'highlighter' ? brushSize * 3 : activeTool === 'neon' ? brushSize * 1.5 : brushSize,
            tool: activeTool,
          });
        }
        currentStroke.value = null;
        currentPoints = [];
      })
      .minDistance(1)
      .maxPointers(1);
  }, [activeTool, activeColor, brushSize, canvasLayout.width, canvasLayout.height]);

  const commitStroke = useCallback((stroke: DrawStroke) => {
    setStrokes((prev) => [...prev, stroke]);
  }, []);

  const handleUndo = useCallback(() => {
    haptic.selection();
    setStrokes((prev) => prev.slice(0, -1));
  }, [haptic]);

  const handleClear = useCallback(() => {
    haptic.medium();
    setStrokes([]);
  }, [haptic]);

  const handleDone = useCallback(() => {
    haptic.medium();
    const payload: any = {
      strokes,
      opacity: 1,
    };
    if (isEditing && editingLayer) {
      onAddLayer({
        ...editingLayer,
        payload: { ...editingLayer.payload, ...payload },
      } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('draw'), 10),
        type: 'draw',
        width: 0.9,
        height: 0.9,
        payload,
      });
    }
    onClose();
  }, [strokes, isEditing, editingLayer, onAddLayer, onClose, haptic]);

  // Build Skia paths for rendering
  const renderStrokes = useMemo(() => {
    const allStrokes = [...strokes];
    // Include current stroke for live preview
    const live = currentStroke.value;
    if (live && live.points.length > 1) allStrokes.push(live);
    return allStrokes;
  }, [strokes, renderTick]);

  return (
    <PickerShell title={isEditing ? 'Edit Drawing' : 'Draw'} onClose={onClose}>
      <View style={styles.drawBody}>
        {/* Drawing canvas */}
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View
            style={styles.drawCanvasWrap}
            onLayout={(e) => setCanvasLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            <GestureDetector gesture={panGesture}>
              <View style={StyleSheet.absoluteFill} collapsable={false}>
                <Canvas style={StyleSheet.absoluteFill}>
                  {renderStrokes.map((stroke, i) => {
                    const skPath = buildSkiaPath(stroke.points, canvasLayout.width, canvasLayout.height);
                    if (!skPath) return null;
                    const isEraser = stroke.tool === 'eraser';
                    const isMarker = stroke.tool === 'marker';
                    const isHighlighter = stroke.tool === 'highlighter';
                    const isNeon = stroke.tool === 'neon';
                    return (
                      <Path
                        key={i}
                        path={skPath}
                        style="stroke"
                        strokeWidth={stroke.width}
                        color={stroke.color}
                        strokeCap="round"
                        strokeJoin="round"
                        opacity={isHighlighter ? 0.35 : isMarker ? 0.6 : 1}
                        blendMode={isEraser ? "clear" : isNeon ? "screen" : "srcOver"}
                      />
                    );
                  })}
                </Canvas>
              </View>
            </GestureDetector>
            {strokes.length === 0 && (
              <View style={styles.drawCanvasHint} pointerEvents="none">
                <Text style={styles.drawCanvasHintText}>Draw with your finger</Text>
              </View>
            )}
          </View>
        </GestureHandlerRootView>

        {/* Tool selector */}
        <Text style={styles.pickerSectionLabel}>Brush</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {DRAW_TOOLS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => { haptic.selection(); setActiveTool(t.key); }}
              style={[styles.styleOption, activeTool === t.key && styles.styleOptionActive]}
              accessibilityLabel={`Brush ${t.label}`}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Ionicons name={t.icon as any} size={18} color={activeTool === t.key ? colors.brand : colors.textSecondary} />
              <Text style={[styles.styleOptionText, activeTool === t.key && styles.styleOptionTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Color selector (hidden for eraser) */}
        {activeTool !== 'eraser' && (
          <>
            <Text style={styles.pickerSectionLabel}>Color</Text>
            <View style={styles.colorRow}>
              {DRAW_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => { haptic.selection(); setActiveColor(c); }}
                  style={[styles.colorOption, { backgroundColor: c }, activeColor === c && styles.colorOptionActive]}
                  accessibilityLabel={`Draw color ${c}`}
                  accessibilityRole="button"
                  hitSlop={12}
                />
              ))}
            </View>
          </>
        )}

        {/* Brush size */}
        <Text style={styles.pickerSectionLabel}>Size</Text>
        <View style={styles.brushSizeRow}>
          {BRUSH_SIZES.map((s) => {
            const isActive = brushSize === s;
            const previewColor = activeTool === 'eraser' ? colors.textSecondary : isActive ? colors.brand : activeColor;
            const dotSize = Math.max(6, Math.min(22, s + 4));
            return (
              <Pressable
                key={s}
                onPress={() => { haptic.selection(); setBrushSize(s); }}
                style={[styles.brushSizeOption, isActive && styles.brushSizeOptionActive]}
                accessibilityLabel={`Brush size ${s}`}
                accessibilityRole="button"
                hitSlop={12}
              >
                <View style={[styles.brushSizeDot, { width: dotSize, height: dotSize, backgroundColor: previewColor }]} />
              </Pressable>
            );
          })}
        </View>

        {/* Actions */}
        <View style={styles.drawActions}>
          <PressScale onPress={handleUndo} style={styles.drawActionBtn} accessibilityLabel="Undo stroke" hitSlop={12}>
            <Ionicons name="arrow-undo-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.drawActionLabel}>Undo</Text>
          </PressScale>
          <PressScale onPress={handleClear} style={styles.drawActionBtn} accessibilityLabel="Clear drawing" hitSlop={12}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.drawActionLabel, { color: colors.danger }]}>Clear</Text>
          </PressScale>
          <PressScale onPress={handleDone} style={[styles.drawDoneBtn, { backgroundColor: colors.brand }]} accessibilityLabel="Done drawing" hitSlop={12}>
            <Text style={styles.drawDoneBtnText}>Done</Text>
          </PressScale>
        </View>
      </View>
    </PickerShell>
  );
}

// ── GIF Picker ────────────────────────────────────────────────────
// GIPHY-style search: trending GIFs on load, search by query.
// Uses GIPHY public API with configurable key (EXPO_PUBLIC_GIPHY_API_KEY).

const GIPHY_API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY?.trim() || 'dc6zaTOxFJmzC';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

interface GifResult {
  id: string;
  gifUrl: string;
  stillUrl: string;
  altText: string;
  width: number;
  height: number;
}

function GifPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchGifs = useCallback(async (searchQuery: string) => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = searchQuery.trim()
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery.trim())}&limit=24&rating=g`
        : `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`GIPHY ${res.status}`);
      const json = await res.json();
      if (!mountedRef.current) return;
      const gifs: GifResult[] = (json.data ?? []).map((g: any) => ({
        id: g.id,
        gifUrl: g.images?.fixed_height?.url ?? g.images?.original?.url ?? '',
        stillUrl: g.images?.fixed_height_still?.url ?? g.images?.original_still?.url,
        altText: g.title?.slice(0, 80) ?? 'GIF',
        width: parseInt(g.images?.fixed_height?.width ?? '200', 10),
        height: parseInt(g.images?.fixed_height?.height ?? '200', 10),
      })).filter((g: GifResult) => g.gifUrl);
      setResults(gifs);
    } catch (err) {
      if (!mountedRef.current) return;
      setError((err as Error).message || 'Failed to load GIFs');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    fetchGifs('');
  }, [fetchGifs]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchGifs(query);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, fetchGifs]);

  const handleSelect = useCallback((gif: GifResult) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('gif'), 10),
      type: 'gif',
      width: 0.25,
      height: 0.25 * (gif.height / gif.width),
      payload: {
        gifUrl: gif.gifUrl,
        stillUrl: gif.stillUrl,
        altText: gif.altText,
        source: 'giphy',
        opacity: 1,
      },
    });
    onClose();
  }, [onAddLayer, onClose, haptic]);

  return (
    <PickerShell title="GIF" onClose={onClose}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search GIFs..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search GIFs"
        />
        {isLoading && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load GIFs</Text>
          <Pressable onPress={() => fetchGifs(query)} style={styles.retryBtn} accessibilityLabel="Retry GIF search" accessibilityRole="button" hitSlop={12}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item)}
              style={styles.gifCell}
              accessibilityLabel={`Select GIF ${item.altText}`}
              accessibilityRole="button"
            >
              <Image
                source={{ uri: item.stillUrl || item.gifUrl }}
                style={styles.gifThumb}
                resizeMode="cover"
              />
            </Pressable>
          )}
          style={styles.gifList}
          columnWrapperStyle={styles.gifRow}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={!isLoading ? <View style={styles.emptyState}><Text style={styles.emptyText}>No GIFs found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
}

// ── Music Picker ──────────────────────────────────────────────────
// Instagram-style music sticker: search trending tracks via iTunes API
// (free, no auth required). Shows album art + track name + artist.

interface MusicTrack {
  trackId: string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  previewUrl: string;
}

function MusicPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchTracks = useCallback(async (searchQuery: string) => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = searchQuery.trim()
        ? `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery.trim())}&media=music&limit=25`
        : `https://itunes.apple.com/search?term=top+hits&media=music&limit=25`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`iTunes ${res.status}`);
      const json = await res.json();
      if (!mountedRef.current) return;
      const tracks: MusicTrack[] = (json.results ?? []).map((t: any) => ({
        trackId: String(t.trackId ?? t.collectionId ?? ''),
        trackName: t.trackName ?? t.collectionName ?? 'Unknown Track',
        artistName: t.artistName ?? '',
        artworkUrl: (t.artworkUrl100 ?? t.artworkUrl60 ?? '').replace('100x100', '200x200'),
        previewUrl: t.previewUrl ?? '',
      })).filter((t: MusicTrack) => t.trackId && t.artworkUrl);
      setResults(tracks);
    } catch (err) {
      if (!mountedRef.current) return;
      setError((err as Error).message || 'Failed to load tracks');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTracks('');
  }, [fetchTracks]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchTracks(query);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, fetchTracks]);

  const handleSelect = useCallback((track: MusicTrack) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('music'), 10),
      type: 'music',
      width: 0.5,
      height: 0.12,
      payload: {
        trackName: track.trackName,
        artistName: track.artistName,
        artworkUrl: track.artworkUrl,
        previewUrl: track.previewUrl,
        trackId: track.trackId,
        opacity: 1,
      },
    });
    onClose();
  }, [onAddLayer, onClose, haptic]);

  return (
    <PickerShell title="Music" onClose={onClose}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search songs, artists..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search music"
        />
        {isLoading && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load music</Text>
          <Pressable onPress={() => fetchTracks(query)} style={styles.retryBtn} accessibilityLabel="Retry music search" accessibilityRole="button" hitSlop={12}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.trackId}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item)}
              style={styles.musicRow}
              accessibilityLabel={`Select ${item.trackName} by ${item.artistName}`}
              accessibilityRole="button"
            >
              <Image source={{ uri: item.artworkUrl }} style={styles.musicArtwork} resizeMode="cover" />
              <View style={styles.musicInfo}>
                <Text style={styles.musicTrackName} numberOfLines={1}>{item.trackName}</Text>
                <Text style={styles.musicArtistName} numberOfLines={1}>{item.artistName}</Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
            </Pressable>
          )}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={!isLoading ? <View style={styles.emptyState}><Text style={styles.emptyText}>No tracks found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
}

// ── Quiz Picker ───────────────────────────────────────────────────
// Instagram 2026 parity: multiple-choice quiz with correct answer.

const QUIZ_EMOJIS = ['🎯', '🔥', '💡', '❓', '✅', '⭐', '🎨', '👍'];

function QuizPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isEditing = editingLayer?.type === 'quiz';
  const existing = isEditing ? (editingLayer as any).payload : null;

  const [question, setQuestion] = useState(existing?.question ?? '');
  const [options, setOptions] = useState<string[]>(existing?.options?.map((o: any) => o.label) ?? ['', '']);
  const [correctIdx, setCorrectIdx] = useState<number>(() => {
    if (existing?.correctOptionId && existing?.options) {
      return existing.options.findIndex((o: any) => o.id === existing.correctOptionId);
    }
    return 0;
  });
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎯');

  const handleAdd = useCallback(() => {
    if (!question.trim() || options.filter(o => o.trim()).length < 2) return;
    const cleanOptions = options.filter(o => o.trim()).slice(0, 4);
    const optionObjs = cleanOptions.map((label, i) => ({ id: `opt_${i}_${Date.now()}`, label: label.trim() }));
    const payload: any = {
      question: question.trim(),
      options: optionObjs,
      correctOptionId: optionObjs[correctIdx]?.id ?? optionObjs[0].id,
      emoji,
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('quiz'), 10),
        type: 'quiz',
        width: 0.7,
        height: 0.25,
        payload,
      });
    }
    onClose();
  }, [question, options, correctIdx, emoji, isEditing, editingLayer, onAddLayer, onClose]);

  return (
    <PickerShell title={isEditing ? 'Edit Quiz' : 'Add Quiz'} onClose={onClose}>
      <View style={styles.textPickerBody}>
        <TextInput
          style={styles.textInput}
          placeholder="Ask a question..."
          placeholderTextColor={colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          maxLength={100}
          autoFocus
          accessibilityLabel="Quiz question"
        />
        <Text style={styles.pickerSectionLabel}>Options (tap to mark correct)</Text>
        {options.map((opt, i) => (
          <View key={i} style={styles.quizOptionRow}>
            <Pressable
              onPress={() => { haptic.selection(); setCorrectIdx(i); }}
              style={[styles.quizCorrectDot, correctIdx === i && { backgroundColor: colors.success }]}
              accessibilityLabel={`Mark option ${i + 1} as correct`}
              accessibilityRole="button"
            >
              {correctIdx === i && <Ionicons name="checkmark" size={14} color="#fff" />}
            </Pressable>
            <TextInput
              style={[styles.textInput, { flex: 1, minHeight: 44 }]}
              placeholder={`Option ${i + 1}`}
              placeholderTextColor={colors.textMuted}
              value={opt}
              onChangeText={(v) => setOptions(prev => prev.map((o, idx) => idx === i ? v : o))}
              maxLength={50}
              accessibilityLabel={`Quiz option ${i + 1}`}
            />
            {options.length > 2 && (
              <Pressable
                onPress={() => {
                  setOptions(prev => prev.filter((_, idx) => idx !== i));
                  if (correctIdx >= i && correctIdx > 0) setCorrectIdx(correctIdx - 1);
                }}
                style={styles.quizRemoveBtn}
                accessibilityLabel={`Remove option ${i + 1}`}
                hitSlop={12}
              >
                <Ionicons name="close-circle" size={20} color={colors.danger} />
              </Pressable>
            )}
          </View>
        ))}
        {options.length < 4 && (
          <Pressable
            onPress={() => { haptic.selection(); setOptions(prev => [...prev, '']); }}
            style={styles.quizAddOptionBtn}
            accessibilityLabel="Add option"
            hitSlop={12}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
            <Text style={styles.quizAddOptionText}>Add Option</Text>
          </Pressable>
        )}
        <Text style={styles.pickerSectionLabel}>Emoji</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {QUIZ_EMOJIS.map((e) => (
            <Pressable
              key={e}
              onPress={() => { haptic.selection(); setEmoji(e); }}
              style={[styles.styleOption, emoji === e && styles.styleOptionActive]}
              accessibilityLabel={`Emoji ${e}`}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          onPress={handleAdd}
          disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
          style={[styles.saveBtn, (!question.trim() || options.filter(o => o.trim()).length < 2) && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update quiz' : 'Add quiz'}
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Quiz'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
}

// ── Question Picker ───────────────────────────────────────────────
// Instagram 2026 parity: open-ended question box sticker.

function QuestionPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isEditing = editingLayer?.type === 'question';
  const existing = isEditing ? (editingLayer as any).payload : null;

  const [prompt, setPrompt] = useState(existing?.prompt ?? '');
  const [placeholder, setPlaceholder] = useState(existing?.placeholder ?? 'Type something...');
  const [bgColor, setBgColor] = useState(existing?.backgroundColor ?? '#9b0202');

  const QUESTION_BG_COLORS = ['#9b0202', '#215634', '#06489A', '#6B3245', '#1a1a1a', '#C9A46A'];

  const handleAdd = useCallback(() => {
    if (!prompt.trim()) return;
    const payload: any = {
      prompt: prompt.trim(),
      placeholder: placeholder.trim() || 'Type something...',
      backgroundColor: bgColor,
      textColor: '#ffffff',
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('question'), 10),
        type: 'question',
        width: 0.6,
        height: 0.12,
        payload,
      });
    }
    onClose();
  }, [prompt, placeholder, bgColor, isEditing, editingLayer, onAddLayer, onClose]);

  return (
    <PickerShell title={isEditing ? 'Edit Question' : 'Ask Me'} onClose={onClose}>
      <View style={styles.textPickerBody}>
        <View style={[styles.textPreview, { backgroundColor: bgColor }]}>
          <Text style={{ color: '#fff', fontFamily: Typography.family.semibold, fontSize: Type.bodyEmphasis.size }}>
            {prompt.trim() || 'Ask me a question'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: Typography.family.regular, fontSize: Type.caption.size, marginTop: 4 }}>
            {placeholder.trim() || 'Type something...'}
          </Text>
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Question prompt..."
          placeholderTextColor={colors.textMuted}
          value={prompt}
          onChangeText={setPrompt}
          maxLength={100}
          autoFocus
          accessibilityLabel="Question prompt"
        />
        <TextInput
          style={styles.textInput}
          placeholder="Placeholder text..."
          placeholderTextColor={colors.textMuted}
          value={placeholder}
          onChangeText={setPlaceholder}
          maxLength={80}
          accessibilityLabel="Question placeholder"
        />
        <Text style={styles.pickerSectionLabel}>Background</Text>
        <View style={styles.colorRow}>
          {QUESTION_BG_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setBgColor(c)}
              style={[styles.colorOption, { backgroundColor: c }, bgColor === c && styles.colorOptionActive]}
              accessibilityLabel={`Background ${c}`}
              accessibilityRole="button"
              hitSlop={12}
            />
          ))}
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={!prompt.trim()}
          style={[styles.saveBtn, !prompt.trim() && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update question' : 'Add question'}
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Question'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
}

// ── Emoji Slider Picker ───────────────────────────────────────────
// Instagram 2026 parity: emoji slider for intensity measurement.

const SLIDER_EMOJIS = ['😍', '🔥', '💯', '😂', '🤔', '👍', '❤️', '✨', '🎨', '🛍️'];

function EmojiSliderPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isEditing = editingLayer?.type === 'emojiSlider';
  const existing = isEditing ? (editingLayer as any).payload : null;

  const [question, setQuestion] = useState(existing?.question ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '😍');
  const [endLabel, setEndLabel] = useState(existing?.endLabel ?? '');
  const [sliderColor, setSliderColor] = useState(existing?.sliderColor ?? '#C9A46A');

  const SLIDER_COLORS = ['#C9A46A', '#9b0202', '#215634', '#06489A', '#6B3245', '#E06666'];

  const handleAdd = useCallback(() => {
    if (!question.trim()) return;
    const payload: any = {
      question: question.trim(),
      emoji,
      endLabel: endLabel.trim(),
      sliderColor,
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('emojiSlider'), 10),
        type: 'emojiSlider',
        width: 0.6,
        height: 0.1,
        payload,
      });
    }
    onClose();
  }, [question, emoji, endLabel, sliderColor, isEditing, editingLayer, onAddLayer, onClose]);

  return (
    <PickerShell title={isEditing ? 'Edit Slider' : 'Emoji Slider'} onClose={onClose}>
      <View style={styles.textPickerBody}>
        <View style={[styles.textPreview, { backgroundColor: '#1a1a1a' }]}>
          <Text style={{ color: '#fff', fontFamily: Typography.family.semibold, fontSize: Type.body.size, marginBottom: 8 }}>
            {question.trim() || 'How much do you love it?'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 28 }}>{emoji}</Text>
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <View style={{ width: '60%', height: '100%', borderRadius: 3, backgroundColor: sliderColor }} />
            </View>
          </View>
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Ask something..."
          placeholderTextColor={colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          maxLength={80}
          autoFocus
          accessibilityLabel="Slider question"
        />
        <TextInput
          style={styles.textInput}
          placeholder="End label (optional)..."
          placeholderTextColor={colors.textMuted}
          value={endLabel}
          onChangeText={setEndLabel}
          maxLength={20}
          accessibilityLabel="Slider end label"
        />
        <Text style={styles.pickerSectionLabel}>Emoji</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {SLIDER_EMOJIS.map((e) => (
            <Pressable
              key={e}
              onPress={() => { haptic.selection(); setEmoji(e); }}
              style={[styles.styleOption, emoji === e && styles.styleOptionActive]}
              accessibilityLabel={`Emoji ${e}`}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.pickerSectionLabel}>Slider Color</Text>
        <View style={styles.colorRow}>
          {SLIDER_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setSliderColor(c)}
              style={[styles.colorOption, { backgroundColor: c }, sliderColor === c && styles.colorOptionActive]}
              accessibilityLabel={`Slider color ${c}`}
              accessibilityRole="button"
              hitSlop={12}
            />
          ))}
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={!question.trim()}
          style={[styles.saveBtn, !question.trim() && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update slider' : 'Add slider'}
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Slider'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
}

// ── Countdown Picker ──────────────────────────────────────────────
// Instagram 2026 parity: countdown to a date/time sticker.

function CountdownPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isEditing = editingLayer?.type === 'countdown';
  const existing = isEditing ? (editingLayer as any).payload : null;

  const [label, setLabel] = useState(existing?.label ?? '');
  const [endDate, setEndDate] = useState(() => {
    if (existing?.endDateTime) return new Date(existing.endDateTime);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    return d;
  });
  const [color, setColor] = useState(existing?.color ?? '#C9A46A');

  const COUNTDOWN_COLORS = ['#C9A46A', '#9b0202', '#215634', '#06489A', '#6B3245', '#1a1a1a'];

  const handleAdd = useCallback(() => {
    if (!label.trim()) return;
    const payload: any = {
      label: label.trim(),
      endDateTime: endDate.toISOString(),
      color,
      textColor: '#ffffff',
    };
    if (isEditing && editingLayer) {
      onAddLayer({ ...editingLayer, payload: { ...editingLayer.payload, ...payload } } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('countdown'), 10),
        type: 'countdown',
        width: 0.5,
        height: 0.12,
        payload,
      });
    }
    onClose();
  }, [label, endDate, color, isEditing, editingLayer, onAddLayer, onClose]);

  const formatDate = (d: Date) => {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    return d.toLocaleDateString('en-US', opts);
  };

  return (
    <PickerShell title={isEditing ? 'Edit Countdown' : 'Countdown'} onClose={onClose}>
      <View style={styles.textPickerBody}>
        <View style={[styles.textPreview, { backgroundColor: color }]}>
          <Text style={{ color: '#fff', fontFamily: Typography.family.semibold, fontSize: Type.bodyEmphasis.size }}>
            {label.trim() || 'Event countdown'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontFamily: Typography.family.medium, fontSize: Type.title.size, marginTop: 4 }}>
            {formatDate(endDate)}
          </Text>
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Countdown label..."
          placeholderTextColor={colors.textMuted}
          value={label}
          onChangeText={setLabel}
          maxLength={40}
          autoFocus
          accessibilityLabel="Countdown label"
        />
        <Text style={styles.pickerSectionLabel}>End Date & Time</Text>
        <Pressable
          onPress={() => {
            // Simple date adjustment: cycle through next 7 days at 6pm
            const d = new Date(endDate);
            d.setDate(d.getDate() + 1);
            if (d.getDate() === 1) d.setDate(endDate.getDate() - 6);
            setEndDate(d);
          }}
          style={styles.countdownDateBtn}
          accessibilityLabel="Adjust end date"
          accessibilityRole="button"
        >
          <Ionicons name="calendar-outline" size={20} color={colors.brand} />
          <Text style={styles.countdownDateText}>{formatDate(endDate)}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.pickerSectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {COUNTDOWN_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[styles.colorOption, { backgroundColor: c }, color === c && styles.colorOptionActive]}
              accessibilityLabel={`Countdown color ${c}`}
              accessibilityRole="button"
              hitSlop={12}
            />
          ))}
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={!label.trim()}
          style={[styles.saveBtn, !label.trim() && styles.saveBtnDisabled]}
          accessibilityLabel={isEditing ? 'Update countdown' : 'Add countdown'}
          accessibilityRole="button"
        >
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Countdown'}</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
}

// ── Shape Picker ───────────────────────────────────────────────────

const SHAPES: Array<{ shape: 'circle' | 'square' | 'line' | 'arrow' | 'star' | 'heart'; icon: string; label: string }> = [
  { shape: 'circle', icon: 'ellipse-outline', label: 'Circle' },
  { shape: 'square', icon: 'square-outline', label: 'Square' },
  { shape: 'line', icon: 'remove', label: 'Line' },
  { shape: 'arrow', icon: 'arrow-forward', label: 'Arrow' },
  { shape: 'star', icon: 'star-outline', label: 'Star' },
  { shape: 'heart', icon: 'heart-outline', label: 'Heart' },
];

function ShapePicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const handleSelect = useCallback((shape: typeof SHAPES[0]) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('shape'), 5),
      type: 'decorative',
      width: 0.15,
      height: 0.15,
      payload: { shape: shape.shape, color: '#ffffff', opacity: 1 },
    });
    onClose();
  }, [onAddLayer, onClose]);

  return (
    <PickerShell title="Add Shape" onClose={onClose}>
      <View style={styles.shapeGrid}>
        {SHAPES.map((s) => (
          <Pressable key={s.shape} onPress={() => handleSelect(s)} style={styles.shapeOption} accessibilityLabel={`Add ${s.label}`} accessibilityRole="button" hitSlop={12}>
            <Ionicons name={s.icon as any} size={28} color={colors.textPrimary} />
            <Text style={styles.shapeLabel}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </PickerShell>
  );
}

// ── Vote Picker ────────────────────────────────────────────────────

function VotePicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [question, setQuestion] = useState('');
  const [option1, setOption1] = useState('');
  const [option2, setOption2] = useState('');

  const canSave = question.trim().length > 0 && option1.trim().length > 0 && option2.trim().length > 0 && option1.trim() !== option2.trim();

  const handleAdd = useCallback(() => {
    if (!canSave) return;
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('vote'), 10),
      type: 'vote',
      width: 0.5,
      height: 0.2,
      payload: {
        question: question.trim(),
        options: [
          { id: createStableId('opt'), label: option1.trim() },
          { id: createStableId('opt'), label: option2.trim() },
        ],
      },
    });
    onClose();
  }, [question, option1, option2, canSave, onAddLayer, onClose]);

  return (
    <PickerShell title="Add Style Vote" onClose={onClose}>
      <View style={styles.textPickerBody}>
        <Text style={styles.sectionLabel}>Question</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. Which outfit is better?"
          placeholderTextColor={colors.textMuted}
          value={question}
          onChangeText={setQuestion}
          maxLength={100}
          autoFocus
          accessibilityLabel="Vote question"
        />
        <Text style={styles.sectionLabel}>Option 1</Text>
        <TextInput
          style={styles.textInput}
          placeholder="First option"
          placeholderTextColor={colors.textMuted}
          value={option1}
          onChangeText={setOption1}
          maxLength={50}
          accessibilityLabel="Vote option 1"
        />
        <Text style={styles.sectionLabel}>Option 2</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Second option"
          placeholderTextColor={colors.textMuted}
          value={option2}
          onChangeText={setOption2}
          maxLength={50}
          accessibilityLabel="Vote option 2"
        />
        <Pressable onPress={handleAdd} style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} accessibilityLabel="Add vote" accessibilityRole="button" hitSlop={12}>
          <Text style={styles.saveBtnText}>Add Vote</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.md, paddingVertical: Space.sm },
  title: { fontFamily: Typography.family.semibold, fontSize: Type.subtitle.size, color: colors.textPrimary },
  closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: Radius.sm },
  mediaOptions: { flexDirection: 'row', justifyContent: 'center', gap: Space.lg, paddingVertical: Space.xl },
  mediaOption: { alignItems: 'center', gap: 8, minWidth: 80 },
  mediaOptionLabel: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textPrimary },
  // ── Media grid ──
  mediaGridContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
  mediaGridRow: { gap: Space.xs, marginBottom: Space.xs },
  mediaGridCell: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaGridThumb: {
    width: '100%',
    height: '100%',
  },
  mediaGridVideoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mediaGridDuration: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Typography.family.medium,
  },
  mediaGridSelectedOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  mediaGridSelectionBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaGridSelectionText: {
    color: '#000',
    fontSize: 13,
    fontFamily: Typography.family.bold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  addBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  mediaGridFooter: {
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  mediaLoadingState: {
    paddingVertical: Space.xxl,
    alignItems: 'center',
  },
  mediaEmptyState: {
    paddingVertical: Space.xxl,
    alignItems: 'center',
    gap: Space.md,
  },
  mediaEmptyText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  mediaPermissionState: {
    paddingVertical: Space.xxl,
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.xl,
  },
  mediaPermissionTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    marginTop: Space.sm,
  },
  mediaPermissionText: {
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    textAlign: 'center',
    lineHeight: 22,
  },
  mediaPermissionBtn: {
    paddingHorizontal: Space.lg,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Space.sm,
  },
  mediaPermissionBtnText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.md, paddingVertical: Space.sm, gap: 8 },
  searchIcon: {},
  searchInput: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md,
    paddingHorizontal: Space.md, paddingVertical: Space.sm, fontSize: Type.body.size, color: colors.textPrimary,
  },
  resultList: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  resultThumb: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  resultThumbImg: { width: '100%', height: '100%' },
  resultAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
  resultAvatarText: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: colors.textSecondary },
  resultInfo: { flex: 1, gap: 2 },
  resultName: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textPrimary },
  resultPrice: { fontFamily: Typography.family.bold, fontSize: Type.caption.size, color: colors.brand },
  resultSubtext: { fontFamily: Typography.family.regular, fontSize: Type.caption.size, color: colors.textMuted },
  loadingBody: { paddingVertical: Space.xl, alignItems: 'center' },
  emptyState: { paddingVertical: Space.xl, alignItems: 'center' },
  emptyText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textMuted },
  errorBody: { paddingVertical: Space.xl, alignItems: 'center', gap: Space.sm },
  errorText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textMuted },
  retryBtn: { paddingHorizontal: Space.lg, paddingVertical: Space.sm, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  retryBtnText: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: colors.brand },
  textPickerBody: { paddingHorizontal: Space.md, paddingBottom: Space.xl, gap: Space.sm },
  // Live preview area — dark canvas mimicking the poster/look background
  textPreview: {
    minHeight: 90,
    borderRadius: Radius.lg,
    backgroundColor: '#0d0d0d',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  textPreviewText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
  },
  sectionLabel: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg,
    paddingHorizontal: Space.md, paddingVertical: Space.md, fontSize: Type.body.size, color: colors.textPrimary, minHeight: 52,
  },
  saveBtn: { height: 48, borderRadius: Radius.lg, backgroundColor: colors.brand, justifyContent: 'center', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: colors.textInverse, fontFamily: Typography.family.semibold, fontSize: Type.bodyEmphasis.size, letterSpacing: 0.3 },
  pickerSectionLabel: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Space.xs },
  styleScroll: { marginHorizontal: -Space.md, paddingHorizontal: Space.md },
  styleOption: { paddingHorizontal: Space.md + 2, paddingVertical: Space.sm + 2, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginRight: Space.sm, backgroundColor: colors.surfaceAlt },
  styleOptionActive: { borderColor: colors.brand, backgroundColor: `${colors.brand}18`, borderWidth: 1.5 },
  styleOptionText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textPrimary },
  styleOptionTextActive: { color: colors.brand },
  colorRow: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  colorOption: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorOptionActive: { borderColor: colors.brand, shadowColor: colors.brand, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  colorOptionTransparent: { borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  alignmentRow: { flexDirection: 'row', gap: Space.sm },
  alignmentOption: { width: 44, height: 44, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  alignmentOptionActive: { borderColor: colors.brand, backgroundColor: `${colors.brand}15` },
  shapeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Space.md, paddingVertical: Space.lg, paddingHorizontal: Space.md },
  shapeOption: { alignItems: 'center', gap: 6, width: 80, paddingVertical: Space.sm },
  shapeLabel: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textSecondary },
  // ── Draw picker ──
  drawBody: { paddingHorizontal: Space.md, paddingBottom: Space.xl, gap: Space.xs },
  drawCanvasWrap: {
    flex: 1,
    minHeight: 280,
    borderRadius: Radius.lg,
    backgroundColor: '#161616',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  drawCanvasHint: {
    position: 'absolute',
    bottom: Space.sm,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  drawCanvasHintText: {
    fontFamily: Typography.family.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.28)',
    letterSpacing: 0.3,
  },
  brushSizeRow: { flexDirection: 'row', gap: Space.md, alignItems: 'center', paddingVertical: Space.xs },
  brushSizeOption: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  brushSizeOptionActive: { borderColor: colors.brand, backgroundColor: `${colors.brand}15` },
  brushSizeDot: { borderRadius: 100 },
  drawActions: { flexDirection: 'row', alignItems: 'center', gap: Space.md, marginTop: Space.md },
  drawActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Space.md, paddingVertical: Space.sm, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  drawActionLabel: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: colors.textSecondary },
  drawDoneBtn: { paddingHorizontal: Space.xl, paddingVertical: Space.sm, borderRadius: Radius.full, marginLeft: 'auto' },
  drawDoneBtnText: { fontFamily: Typography.family.semibold, fontSize: Type.bodyEmphasis.size, color: '#fff' },
  // ── GIF picker ──
  gifList: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
  gifRow: { gap: Space.xs, marginBottom: Space.xs },
  gifCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  gifThumb: { width: '100%', height: '100%' },
  // ── Music picker ──
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  musicArtwork: { width: 48, height: 48, borderRadius: Radius.sm },
  musicInfo: { flex: 1, gap: 2 },
  musicTrackName: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textPrimary },
  musicArtistName: { fontFamily: Typography.family.regular, fontSize: Type.caption.size, color: colors.textSecondary },
  // ── Quiz picker ──
  quizOptionRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginBottom: Space.xs },
  quizCorrectDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  quizRemoveBtn: { padding: 4 },
  quizAddOptionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Space.sm },
  quizAddOptionText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.brand },
  // ── Countdown picker ──
  countdownDateBtn: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.md, paddingVertical: Space.md, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border },
  countdownDateText: { flex: 1, fontFamily: Typography.family.medium, fontSize: Type.body.size, color: colors.textPrimary },
  }) as any;
}
