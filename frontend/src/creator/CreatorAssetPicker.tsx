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
import * as MediaLibrary from 'expo-media-library';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { searchListingsFromApi, type ListingSearchResult } from '../services/listingsApi';
import { searchUsers, type UserSearchResult } from '../services/profileApi';
import { useStore } from '../store/useStore';
import { fetchLooksFromApi } from '../services/looksApi';
import { createStableId } from '../utils/createStableId';
import { SheetContainer, PressScale } from './CreatorAnimations';
import type { CreatorLayer } from './composition';

export type AssetPickerMode = 'media' | 'product' | 'mention' | 'look' | 'text' | 'shape' | 'vote';

export interface CreatorAssetPickerProps {
  visible: boolean;
  mode: AssetPickerMode;
  onClose: () => void;
  onAddLayer: (layer: CreatorLayer) => void;
  editingLayer?: CreatorLayer | null;
}

export function CreatorAssetPicker({ visible, mode, onClose, onAddLayer, editingLayer }: CreatorAssetPickerProps) {
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
    default:
      return null;
  }
}

function PickerShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <SheetContainer visible={true} onClose={onClose} maxHeight={0.85}>
      <KeyboardAwareScrollView contentContainerStyle={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ maxHeight: '100%' }}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close picker">
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

  // ── Permission states ──
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
          >
            <Text style={[styles.mediaPermissionBtnText, { color: colors.textInverse }]}>Allow access</Text>
          </Pressable>
        </View>
      </PickerShell>
    );
  }

  // ── Media grid with multi-select ──
  const renderItem = useCallback(({ item, index }: { item: MediaAsset | 'camera' | 'video'; index: number }) => {
    if (item === 'camera') {
      return (
        <Pressable
          onPress={handleTakePhoto}
          style={[styles.mediaGridCell, { backgroundColor: colors.surfaceAlt }]}
          accessibilityLabel="Take photo with camera"
          accessibilityRole="button"
        >
          <Ionicons name="camera-outline" size={28} color={colors.textPrimary} />
        </Pressable>
      );
    }
    if (item === 'video') {
      return (
        <Pressable
          onPress={handlePickVideo}
          style={[styles.mediaGridCell, { backgroundColor: colors.surfaceAlt }]}
          accessibilityLabel="Pick video from gallery"
          accessibilityRole="button"
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
            >
              <Text style={[styles.addBtnText, { color: colors.textInverse }]}>Add</Text>
            </PressScale>
          )}
          <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close picker">
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
        <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search listings..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search listings"
        />
        {isLoading && <ActivityIndicator size="small" color={Colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't search listings</Text>
          <Pressable onPress={handleRetry} style={styles.retryBtn} accessibilityLabel="Retry search" accessibilityRole="button">
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select ${item.title}`} accessibilityRole="button">
              <View style={styles.resultThumb}>
                {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.resultThumbImg} /> : <Ionicons name="pricetag" size={16} color={Colors.textSecondary} />}
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
        <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search users"
        />
        {isSearching && <ActivityIndicator size="small" color={Colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't search users</Text>
          <Pressable onPress={handleRetry} style={styles.retryBtn} accessibilityLabel="Retry search" accessibilityRole="button">
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select @${item.username}`} accessibilityRole="button">
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
        <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search looks..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search looks"
        />
        {isLoading && <ActivityIndicator size="small" color={Colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load looks</Text>
          <Pressable onPress={loadLooks} style={styles.retryBtn} accessibilityLabel="Retry loading looks" accessibilityRole="button">
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select look ${item.caption}`} accessibilityRole="button">
              <View style={styles.resultAvatar}><Ionicons name="shirt-outline" size={16} color={Colors.textSecondary} /></View>
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

const TEXT_STYLES: Array<{ key: string; label: string }> = [
  { key: 'clean', label: 'Clean' },
  { key: 'headline', label: 'Headline' },
  { key: 'editorial', label: 'Editorial' },
  { key: 'compact', label: 'Compact' },
];

const TEXT_COLORS = ['#ffffff', '#000000', '#ff6b6b', '#4cd964', '#5ac8fa', '#ffcc00', '#ff9500', '#5856d6'];

const TEXT_ALIGNMENTS: Array<{ key: 'left' | 'center' | 'right'; icon: string }> = [
  { key: 'left', icon: 'text-outline' },
  { key: 'center', icon: 'text' },
  { key: 'right', icon: 'text-right' },
];

function TextPicker({ onClose, onAddLayer, editingLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void; editingLayer?: CreatorLayer | null }) {
  const isEditing = editingLayer?.type === 'text';
  const existingPayload = isEditing ? (editingLayer as any).payload : null;

  const [text, setText] = useState(existingPayload?.text ?? '');
  const [textStyle, setTextStyle] = useState(existingPayload?.textStyle ?? 'clean');
  const [textColor, setTextColor] = useState(existingPayload?.textColor ?? '#ffffff');
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>(existingPayload?.alignment ?? 'center');

  const handleAdd = useCallback(() => {
    if (!text.trim()) return;
    if (isEditing && editingLayer) {
      onAddLayer({
        ...editingLayer,
        payload: {
          ...editingLayer.payload,
          text: text.trim(),
          textStyle,
          textColor,
          alignment,
        },
      } as CreatorLayer);
    } else {
      onAddLayer({
        ...baseLayer(createStableId('text'), 10),
        type: 'text',
        width: 0.6,
        height: 0.1,
        payload: {
          text: text.trim(),
          textStyle,
          textColor,
          alignment,
          opacity: 1,
        },
      });
    }
    onClose();
  }, [text, textStyle, textColor, alignment, isEditing, editingLayer, onAddLayer, onClose]);

  return (
    <PickerShell title={isEditing ? 'Edit Text' : 'Add Text'} onClose={onClose}>
      <View style={styles.textPickerBody}>
        <TextInput
          style={styles.textInput}
          placeholder="Type your text..."
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={200}
          autoFocus
          accessibilityLabel="Text content"
        />

        {/* Style selector */}
        <Text style={styles.pickerSectionLabel}>Style</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {TEXT_STYLES.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setTextStyle(s.key)}
              style={[styles.styleOption, textStyle === s.key && styles.styleOptionActive]}
              accessibilityLabel={`Text style ${s.label}`}
              accessibilityRole="button"
            >
              <Text style={[styles.styleOptionText, textStyle === s.key && styles.styleOptionTextActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Color selector */}
        <Text style={styles.pickerSectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {TEXT_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setTextColor(c)}
              style={[styles.colorOption, { backgroundColor: c }, textColor === c && styles.colorOptionActive]}
              accessibilityLabel={`Text color ${c}`}
              accessibilityRole="button"
            />
          ))}
        </View>

        {/* Alignment */}
        <Text style={styles.pickerSectionLabel}>Alignment</Text>
        <View style={styles.alignmentRow}>
          {TEXT_ALIGNMENTS.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => setAlignment(a.key)}
              style={[styles.alignmentOption, alignment === a.key && styles.alignmentOptionActive]}
              accessibilityLabel={`Align ${a.key}`}
              accessibilityRole="button"
            >
              <Ionicons name={a.icon as any} size={18} color={alignment === a.key ? Colors.brand : Colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={handleAdd} style={[styles.saveBtn, !text.trim() && styles.saveBtnDisabled]} disabled={!text.trim()} accessibilityLabel={isEditing ? 'Update text' : 'Add text'} accessibilityRole="button">
          <Text style={styles.saveBtnText}>{isEditing ? 'Update' : 'Add Text'}</Text>
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
  const handleSelect = useCallback((shape: typeof SHAPES[0]) => {
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
          <Pressable key={s.shape} onPress={() => handleSelect(s)} style={styles.shapeOption} accessibilityLabel={`Add ${s.label}`} accessibilityRole="button">
            <Ionicons name={s.icon as any} size={28} color={Colors.textPrimary} />
            <Text style={styles.shapeLabel}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </PickerShell>
  );
}

// ── Vote Picker ────────────────────────────────────────────────────

function VotePicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const [question, setQuestion] = useState('');
  const [option1, setOption1] = useState('');
  const [option2, setOption2] = useState('');

  const canSave = question.trim().length > 0 && option1.trim().length > 0 && option2.trim().length > 0 && option1.trim() !== option2.trim();

  const handleAdd = useCallback(() => {
    if (!canSave) return;
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
          placeholderTextColor={Colors.textMuted}
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
          placeholderTextColor={Colors.textMuted}
          value={option1}
          onChangeText={setOption1}
          maxLength={50}
          accessibilityLabel="Vote option 1"
        />
        <Text style={styles.sectionLabel}>Option 2</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Second option"
          placeholderTextColor={Colors.textMuted}
          value={option2}
          onChangeText={setOption2}
          maxLength={50}
          accessibilityLabel="Vote option 2"
        />
        <Pressable onPress={handleAdd} style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} accessibilityLabel="Add vote" accessibilityRole="button">
          <Text style={styles.saveBtnText}>Add Vote</Text>
        </Pressable>
      </View>
    </PickerShell>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.md, paddingVertical: Space.sm },
  title: { fontFamily: Typography.family.semibold, fontSize: Type.subtitle.size, color: Colors.textPrimary },
  closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: Radius.sm },
  mediaOptions: { flexDirection: 'row', justifyContent: 'center', gap: Space.lg, paddingVertical: Space.xl },
  mediaOption: { alignItems: 'center', gap: 8, minWidth: 80 },
  mediaOptionLabel: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: Colors.textPrimary },
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
    fontWeight: '700',
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
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Space.md, paddingVertical: Space.sm, fontSize: Type.body.size, color: Colors.textPrimary,
  },
  resultList: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: Space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  resultThumb: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  resultThumbImg: { width: '100%', height: '100%' },
  resultAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
  resultAvatarText: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: Colors.textSecondary },
  resultInfo: { flex: 1, gap: 2 },
  resultName: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: Colors.textPrimary },
  resultPrice: { fontFamily: Typography.family.bold, fontSize: Type.caption.size, color: Colors.brand },
  resultSubtext: { fontFamily: Typography.family.regular, fontSize: Type.caption.size, color: Colors.textMuted },
  loadingBody: { paddingVertical: Space.xl, alignItems: 'center' },
  emptyState: { paddingVertical: Space.xl, alignItems: 'center' },
  emptyText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: Colors.textMuted },
  errorBody: { paddingVertical: Space.xl, alignItems: 'center', gap: Space.sm },
  errorText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: Colors.textMuted },
  retryBtn: { paddingHorizontal: Space.lg, paddingVertical: Space.sm, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  retryBtnText: { fontFamily: Typography.family.semibold, fontSize: Type.body.size, color: Colors.brand },
  textPickerBody: { paddingHorizontal: Space.md, paddingBottom: Space.xl, gap: Space.sm },
  sectionLabel: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Space.md, paddingVertical: Space.sm, fontSize: Type.body.size, color: Colors.textPrimary, minHeight: 80,
  },
  saveBtn: { height: 44, borderRadius: Radius.md, backgroundColor: Colors.brand, justifyContent: 'center', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontFamily: Typography.family.semibold, fontSize: Type.body.size },
  pickerSectionLabel: { fontFamily: Typography.family.semibold, fontSize: Type.caption.size, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Space.xs },
  styleScroll: { marginHorizontal: -Space.md },
  styleOption: { paddingHorizontal: Space.md, paddingVertical: Space.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, marginRight: Space.sm },
  styleOptionActive: { borderColor: Colors.brand, backgroundColor: `${Colors.brand}15` },
  styleOptionText: { fontFamily: Typography.family.medium, fontSize: Type.body.size, color: Colors.textPrimary },
  styleOptionTextActive: { color: Colors.brand },
  colorRow: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  colorOption: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  colorOptionActive: { borderColor: Colors.brand },
  alignmentRow: { flexDirection: 'row', gap: Space.sm },
  alignmentOption: { width: 44, height: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
  alignmentOptionActive: { borderColor: Colors.brand, backgroundColor: `${Colors.brand}15` },
  shapeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Space.md, paddingVertical: Space.lg, paddingHorizontal: Space.md },
  shapeOption: { alignItems: 'center', gap: 6, width: 80, paddingVertical: Space.sm },
  shapeLabel: { fontFamily: Typography.family.medium, fontSize: Type.caption.size, color: Colors.textSecondary },
});
