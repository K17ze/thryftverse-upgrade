import React, {
  useState,
  useCallback,
  useEffect,
  useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import {
  FlashList,
  ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles } from './pickerShared';

// ── GIF Picker ────────────────────────────────────────────────────
// GIPHY-style search: trending GIFs on load, search by query.
// Uses GIPHY public API with configurable key (EXPO_PUBLIC_GIPHY_API_KEY).

const GIPHY_API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY?.trim() || 'dc6zaTOxFJmzC';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

const GIF_CATEGORIES: Array<{ key: string; label: string; tag: string }> = [
  { key: 'trending', label: 'Trending', tag: '' },
  { key: 'reactions', label: 'Reactions', tag: 'reactions' },
  { key: 'emotions', label: 'Emotions', tag: 'emotions' },
  { key: 'animals', label: 'Animals', tag: 'animals' },
  { key: 'celebrate', label: 'Celebrate', tag: 'celebrate' },
  { key: 'memes', label: 'Mem', tag: 'memes' },
];

interface GifResult {
  id: string;
  gifUrl: string;
  stillUrl: string;
  altText: string;
  width: number;
  height: number;
}

// Minimal shape of a GIPHY API gif object — only the fields this picker reads.
interface GiphyImageVariant {
  url?: string;
  width?: string;
  height?: string;
}
interface GiphyGif {
  id: string;
  title?: string;
  images?: {
    fixed_height?: GiphyImageVariant;
    fixed_height_still?: GiphyImageVariant;
    original?: GiphyImageVariant;
    original_still?: GiphyImageVariant;
  };
}

export const GifPicker = React.memo(function GifPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('trending');
  const [results, setResults] = useState<GifResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchGifs = useCallback(async (searchQuery: string, category: string) => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const catDef = GIF_CATEGORIES.find((c) => c.key === category);
      const catTag = catDef?.tag ?? '';
      const useTrending = !searchQuery.trim() && (!catTag || category === 'trending');
      const endpoint = searchQuery.trim()
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery.trim())}&limit=24&rating=g`
        : useTrending
          ? `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`
          : `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(catTag)}&limit=24&rating=g`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`GIPHY ${res.status}`);
      const json = (await res.json()) as { data?: GiphyGif[] };
      if (!mountedRef.current) return;
      const gifs: GifResult[] = (json.data ?? []).map((g) => ({
        id: g.id,
        gifUrl: g.images?.fixed_height?.url ?? g.images?.original?.url ?? '',
        stillUrl: g.images?.fixed_height_still?.url ?? g.images?.original_still?.url ?? '',
        altText: g.title?.slice(0, 80) ?? 'GIF',
        width: parseInt(g.images?.fixed_height?.width ?? '200', 10),
        height: parseInt(g.images?.fixed_height?.height ?? '200', 10) })).filter((g: GifResult) => g.gifUrl);
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
    fetchGifs('', 'trending');
  }, [fetchGifs]);

  // Debounced search — refetch when query or category changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchGifs(query, activeCategory);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, activeCategory, fetchGifs]);

  const handleCategorySelect = useCallback((catKey: string) => {
    haptic.selection();
    setActiveCategory(catKey);
    setQuery('');
  }, [haptic]);

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
        opacity: 1 } });
    onClose();
  }, [onAddLayer, onClose, haptic]);

  const renderGifItem = useCallback<ListRenderItem<GifResult>>(({ item }) => (
    <Pressable
      onPress={() => handleSelect(item)}
      style={styles.gifCell}
      accessibilityLabel={`Select GIF ${item.altText}`}
      accessibilityHint="Adds this GIF to the canvas"
      accessibilityRole="button"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Image
        source={{ uri: item.stillUrl || item.gifUrl }}
        style={styles.gifThumb}
        contentFit="cover"
      />
    </Pressable>
  ), [handleSelect, styles]);

  return (
    <PickerShell title="GIF" onClose={onClose} compact>
      {/* Category chips — premium style matching sticker tray */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gifCategoryScroll} contentContainerStyle={styles.gifCategoryContent}>
        {GIF_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          return (
            <Pressable
              key={cat.key}
              onPress={() => handleCategorySelect(cat.key)}
              style={({ pressed }) => [
                styles.gifCategoryChip,
                isActive && { backgroundColor: colors.brand },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={`GIF category ${cat.label}`}
              accessibilityHint="Shows GIFs in this category"
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.gifCategoryChipText, isActive && { color: colors.textInverse }]}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={IconGrammar.metadata} color={colors.textMuted} style={styles.searchIcon} aria-hidden={true} />
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
          accessibilityHint="Type to search for GIFs"
        />
        {isLoading && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load GIFs</Text>
          <Pressable onPress={() => fetchGifs(query, activeCategory)} style={styles.retryBtn} accessibilityLabel="Retry GIF search"
          accessibilityHint="Retries the GIF search" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={results}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={renderGifItem}
          style={styles.gifList}
          keyboardShouldPersistTaps="handled"
          drawDistance={250}
          ListEmptyComponent={!isLoading ? <View style={styles.emptyState}><Text style={styles.emptyText}>No GIFs found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
});
