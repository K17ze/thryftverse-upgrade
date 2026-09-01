import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import type { AutocompleteSuggestion } from '../../services/searchAutocompleteApi';
import { haptics } from '../../utils/haptics';

export interface TagInputWithSuggestionsProps {
  tags: string[];
  tagInput: string;
  onTagInputChange: (text: string) => void;
  onTagSubmit: () => void;
  onRemoveTag: (tag: string) => void;
  tagSuggestions: AutocompleteSuggestion[];
  tagSuggestionsVisible: boolean;
  onSuggestionsVisibleChange: (visible: boolean) => void;
  onSuggestionsClear: () => void;
  onSuggestionPick: (suggestion: AutocompleteSuggestion) => void;
}

/**
 * Tag input with autocomplete dropdown. Renders existing tag chips, a text
 * input for adding new tags, and a FlashList dropdown of autocomplete
 * suggestions fetched from the search service.
 */
function TagInputWithSuggestions({
  tags,
  tagInput,
  onTagInputChange,
  onTagSubmit,
  onRemoveTag,
  tagSuggestions,
  tagSuggestionsVisible,
  onSuggestionsVisibleChange,
  onSuggestionsClear,
  onSuggestionPick }: TagInputWithSuggestionsProps) {
  const { colors } = useAppTheme();

  // Dismissal timer is ref-guarded and cleaned up so a blur followed by an
  // unmount (or a re-focus) never fires a stale dismissal.
  const blurDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (blurDismissTimerRef.current) clearTimeout(blurDismissTimerRef.current);
    };
  }, []);

  const renderTagSuggestion: ListRenderItem<AutocompleteSuggestion> = useCallback(
    ({ item }) => (
      <Pressable
        style={({ pressed }) => [styles.tagSuggestionRow, pressed && { opacity: 0.6 }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={() => onSuggestionPick(item)}
        accessibilityRole="button"
        accessibilityLabel={`Add tag ${item.query}`}
      >
        <Ionicons name="bag-handle-outline" size={16} color={colors.textMuted} aria-hidden={true} />
        <Text style={[styles.tagSuggestionText, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.query}
        </Text>
      </Pressable>
    ),
    [onSuggestionPick, colors],
  );

  return (
    <View style={styles.tagAutocompleteWrap}>
      <View style={styles.tagWrap}>
        {tags.map((tag) => (
          <View key={tag} style={[styles.tagChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.tagText, { color: colors.brand }]}>#{tag}</Text>
            <Pressable onPress={() => onRemoveTag(tag)} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }} accessibilityRole="button" accessibilityLabel={`Remove tag ${tag}`}>
              <Ionicons name="close" size={12} color={colors.textMuted} aria-hidden={true} />
            </Pressable>
          </View>
        ))}
        <TextInput
          style={[styles.tagInput, { color: colors.textPrimary }]}
          placeholder={tags.length === 0 ? 'vintage, denim, oversized...' : ''}
          placeholderTextColor={colors.textMuted}
          value={tagInput}
          onChangeText={onTagInputChange}
          onFocus={() => {
            if (blurDismissTimerRef.current) clearTimeout(blurDismissTimerRef.current);
            onSuggestionsVisibleChange(true);
          }}
          onBlur={() => {
            if (blurDismissTimerRef.current) clearTimeout(blurDismissTimerRef.current);
            blurDismissTimerRef.current = setTimeout(() => onSuggestionsVisibleChange(false), 150);
          }}
          onSubmitEditing={() => {
            onTagSubmit();
            onSuggestionsClear();
            onSuggestionsVisibleChange(false);
          }}
          blurOnSubmit={false}
          returnKeyType="done"
        />
      </View>
      {tagSuggestionsVisible && tagSuggestions.length > 0 && (
        <View style={[styles.tagSuggestionDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <FlashList
            data={tagSuggestions}
            keyExtractor={(item) => `${item.query}_${item.type}`}
            scrollEnabled={false}
            drawDistance={7}
            renderItem={renderTagSuggestion}
          />
        </View>
      )}
    </View>
  );
}

export default TagInputWithSuggestions;

const styles = StyleSheet.create({
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs + 2,
    alignItems: 'center',
    marginTop: Space.xs },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: StyleSheet.hairlineWidth },
  tagText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing },
  tagInput: {
    flex: 1,
    minWidth: Space.xxl + Space.lg,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
    paddingVertical: Space.xs },
  tagAutocompleteWrap: {
    position: 'relative' },
  tagSuggestionDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: Space.xs,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 1000,
    paddingVertical: Space.xs },
  tagSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm },
  tagSuggestionText: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing } });
