import React, {
  useState,
  useCallback,
  useEffect,
  useRef } from 'react';
import {
  View,
  Text,
  Pressable,
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
import {
  searchUsers,
  type UserSearchResult } from '../../../services/profileApi';
import { useStore } from '../../../store/useStore';
import { createStableId } from '../../../utils/createStableId';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { PickerShell, baseLayer, createStyles } from './pickerShared';

// ── Mention Picker ─────────────────────────────────────────────────

export const MentionPicker = React.memo(function MentionPicker({ onClose, onAddLayer }: { onClose: () => void; onAddLayer: (layer: CreatorLayer) => void }) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
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
      payload: { userId: user.id, username: user.username } });
    onClose();
  }, [onAddLayer, onClose, haptic]);

  const renderMentionItem = useCallback<ListRenderItem<UserSearchResult>>(({ item }) => (
    <Pressable onPress={() => handleSelect(item)} style={styles.resultRow} accessibilityLabel={`Select @${item.username}`}
    accessibilityHint="Adds this mention to the canvas" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
      <View style={styles.resultAvatar}>
        {item.avatar ? <Image source={{ uri: item.avatar }} style={styles.resultThumbImg} /> : <Text style={styles.resultAvatarText}>{item.username[0]?.toUpperCase()}</Text>}
      </View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultName}>@{item.username}</Text>
        {item.displayName && <Text style={styles.resultSubtext}>{item.displayName}</Text>}
      </View>
    </Pressable>
  ), [handleSelect, styles]);

  return (
    <PickerShell title="Add Mention" onClose={onClose} compact>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={IconGrammar.metadata} color={colors.textMuted} style={styles.searchIcon} aria-hidden={true} />
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
          accessibilityHint="Type to search users"
        />
        {isSearching && <ActivityIndicator size="small" color={colors.brand} />}
      </View>
      {error ? (
        <View style={styles.errorBody}>
          <Text style={styles.errorText}>Couldn't search users</Text>
          <Pressable onPress={handleRetry} style={styles.retryBtn} accessibilityLabel="Retry search"
          accessibilityHint="Retries the user search" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderMentionItem}
          style={styles.resultList}
          keyboardShouldPersistTaps="handled"
          drawDistance={250}
          ListEmptyComponent={hasSearched && !isSearching ? <View style={styles.emptyState}><Text style={styles.emptyText}>No users found</Text></View> : null}
        />
      )}
    </PickerShell>
  );
});
