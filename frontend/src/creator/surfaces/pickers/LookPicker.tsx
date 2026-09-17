import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  useWindowDimensions } from 'react-native';
import {
  FlashList,
  ListRenderItem } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import { fetchLooksFromApi } from '../../../services/looksApi';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles } from './pickerShared';

// ── Look Picker ────────────────────────────────────────────────────

export const LookPicker = React.memo(function LookPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [query, setQuery] = useState('');
  const [allLooks, setAllLooks] = useState<Array<{ id: string; caption: string; mediaUrl: string; posterUrl: string | null; mediaType?: string; creatorId: string }>>([]);
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
          posterUrl: l.posterUrl ?? null,
          mediaType: l.mediaType,
          creatorId: l.creatorId })));
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

  const handleSelect = useCallback((item: { id: string; caption: string; mediaUrl: string; posterUrl?: string | null; mediaType?: string }) => {
    haptic.selection();
    onAddLayer({
      ...baseLayer(createStableId('look'), 10),
      type: 'look',
      width: 0.2,
      height: 0.08,
      payload: {
        lookId: item.id,
        snapshotCaption: item.caption,
        // Video looks must snapshot the JPEG poster, not the m3u8 playlist.
        snapshotImageUrl: item.mediaType === 'video' ? (item.posterUrl ?? item.mediaUrl) : item.mediaUrl } });
    onClose();
  }, [onAddLayer, onClose, haptic]);

  const renderLookItem = useCallback<ListRenderItem<{ id: string; caption: string; mediaUrl: string; posterUrl: string | null; mediaType?: string; creatorId: string }>>(({ item }) => (
    <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select look ${item.caption}`}
    accessibilityHint="Adds this look to the canvas" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <View style={styles.resultAvatar}><Ionicons name="shirt-outline" size={IconGrammar.metadata} color={colors.textSecondary} aria-hidden={true} /></View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={2}>{item.caption}</Text>
      </View>
    </Pressable>
  ), [handleSelect, styles, colors]);

  return (
    <PickerShell title="Add Look" onClose={onClose} compact>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={IconGrammar.metadata} color={colors.textMuted} style={styles.searchIcon} aria-hidden={true} />
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
          accessibilityHint="Type to search looks"
        />
        {isLoading && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't load looks</Text>
          <Pressable onPress={loadLooks} style={styles.retryBtn} accessibilityLabel="Retry loading looks"
          accessibilityHint="Reloads the look list" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderLookItem}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          drawDistance={250}
          ListEmptyComponent={!isLoading ? <View style={styles.emptyState}><Text style={styles.emptyText}>No looks found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
});
