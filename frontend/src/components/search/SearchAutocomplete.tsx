import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import {
  Space,
  Radius,
  Stroke,
  Typography,
  Type,
} from '../../theme/designTokens';
import {
  AUTOCOMPLETE_DEMO_MODE,
  type AutocompleteSuggestion,
  type AutocompleteSuggestionType,
} from '../../services/searchAutocompleteApi';

// ---------------------------------------------------------------------------
// Icon mapping per suggestion type
// ---------------------------------------------------------------------------

const TYPE_ICON: Record<AutocompleteSuggestionType, keyof typeof Ionicons.glyphMap> = {
  category: 'grid-outline',
  brand: 'pricetag-outline',
  style: 'shirt-outline',
  size: 'resize-outline',
  color: 'color-palette-outline',
  recent: 'time-outline',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SearchAutocompleteProps {
  /** Ranked autocomplete suggestions for the current query. */
  suggestions: AutocompleteSuggestion[];
  /** Trending searches shown at the top (3–5). */
  trending: string[];
  /** Recent searches shown when the input is empty and focused. */
  recent: string[];
  /** The raw query — used to highlight the matched portion. */
  query: string;
  /** Whether the dropdown is visible (focused + no explicit hide). */
  visible: boolean;
  /** Called when a suggestion or trending/recent term is tapped. */
  onSelect: (suggestion: AutocompleteSuggestion | { query: string; type: 'recent' | 'trending'; confidence: number; source: 'recent' | 'trending' }) => void;
  /** Called when the user clears recent searches. */
  onClearRecent?: () => void;
}

/**
 * Search autocomplete dropdown.
 *
 * Renders below the search input. Shows trending searches at the top, recent
 * searches when available, and ranked suggestions for the current query with
 * the matched portion highlighted and a subtle confidence dot.
 *
 * Per AGENTS.md §11, a "Demo mode" indicator is shown while
 * `AUTOCOMPLETE_DEMO_MODE` is true so the user knows the ranking is
 * illustrative.
 */
export function SearchAutocomplete({
  suggestions,
  trending,
  recent,
  query,
  visible,
  onSelect,
  onClearRecent,
}: SearchAutocompleteProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleSelect = useCallback(
    (s: Parameters<SearchAutocompleteProps['onSelect']>[0]) => {
      haptic.light();
      onSelect(s);
    },
    [haptic, onSelect],
  );

  if (!visible) return null;

  // Build a flat list of renderable rows for FlashList.
  type Row =
    | { kind: 'header'; text: string }
    | { kind: 'trending'; term: string }
    | { kind: 'recent'; term: string }
    | { kind: 'clear' }
    | { kind: 'suggestion'; suggestion: AutocompleteSuggestion }
    | { kind: 'demo' };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (trending.length > 0) {
      out.push({ kind: 'header', text: 'Trending' });
      for (const term of trending.slice(0, 5)) {
        out.push({ kind: 'trending', term });
      }
    }
    if (recent.length > 0) {
      out.push({ kind: 'header', text: 'Recent' });
      for (const term of recent) {
        out.push({ kind: 'recent', term });
      }
      if (onClearRecent) out.push({ kind: 'clear' });
    }
    if (suggestions.length > 0) {
      out.push({ kind: 'header', text: 'Suggestions' });
      for (const suggestion of suggestions) {
        out.push({ kind: 'suggestion', suggestion });
      }
    }
    if (AUTOCOMPLETE_DEMO_MODE) {
      out.push({ kind: 'demo' });
    }
    return out;
  }, [trending, recent, suggestions, onClearRecent]);

  const hasContent = rows.some(
    (r) => r.kind === 'trending' || r.kind === 'recent' || r.kind === 'suggestion',
  );
  if (!hasContent && !AUTOCOMPLETE_DEMO_MODE) return null;

  const renderItem = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'header':
        return <Text style={styles.sectionHeader}>{item.text}</Text>;
      case 'trending':
        return (
          <Pressable
            style={styles.row}
            onPress={() =>
              handleSelect({
                query: item.term,
                type: 'trending',
                confidence: 0.8,
                source: 'trending',
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Search trending: ${item.term}`}
            accessibilityHint="Fills the search box and searches"
          >
            <Ionicons name="trending-up" size={18} color={colors.danger} style={styles.rowIcon} />
            <Text style={styles.rowText} numberOfLines={1}>
              {item.term}
            </Text>
          </Pressable>
        );
      case 'recent':
        return (
          <Pressable
            style={styles.row}
            onPress={() =>
              handleSelect({
                query: item.term,
                type: 'recent',
                confidence: 0.6,
                source: 'recent',
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Search recent: ${item.term}`}
            accessibilityHint="Fills the search box and searches"
          >
            <Ionicons name="time-outline" size={18} color={colors.textMuted} style={styles.rowIcon} />
            <Text style={styles.rowText} numberOfLines={1}>
              {item.term}
            </Text>
          </Pressable>
        );
      case 'clear':
        return (
          <Pressable
            style={styles.clearRow}
            onPress={onClearRecent}
            accessibilityRole="button"
            accessibilityLabel="Clear recent searches"
          >
            <Ionicons name="close-circle" size={14} color={colors.textMuted} style={styles.rowIcon} />
            <Text style={styles.clearText}>Clear recent</Text>
          </Pressable>
        );
      case 'suggestion':
        return (
          <SuggestionRow
            suggestion={item.suggestion}
            query={query}
            colors={colors}
            styles={styles}
            onPress={() => handleSelect(item.suggestion)}
          />
        );
      case 'demo':
        return (
          <View style={styles.demoRow}>
            <Ionicons
              name="information-circle-outline"
              size={12}
              color={colors.textMuted}
              style={styles.demoIcon}
            />
            <Text style={styles.demoText}>
              Demo mode — autocomplete rankings are illustrative.
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  const keyExtractor = (item: Row, index: number) => {
    switch (item.kind) {
      case 'header':
        return `header_${index}`;
      case 'trending':
        return `trending_${item.term}`;
      case 'recent':
        return `recent_${item.term}`;
      case 'clear':
        return 'clear';
      case 'suggestion':
        return `suggestion_${item.suggestion.query}_${item.suggestion.type}`;
      case 'demo':
        return 'demo';
      default:
        return `row_${index}`;
    }
  };

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        scrollEnabled={false}
        nestedScrollEnabled
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Suggestion row — with matched-portion highlight + confidence dot
// ---------------------------------------------------------------------------

interface SuggestionRowProps {
  suggestion: AutocompleteSuggestion;
  query: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}

const SuggestionRow = React.memo(function SuggestionRow({
  suggestion,
  query,
  colors,
  styles,
  onPress,
}: SuggestionRowProps) {
  const iconName = TYPE_ICON[suggestion.type] ?? 'search-outline';
  const { before, match, after } = splitMatch(suggestion.query, query);
  const confidenceColor = confidenceDotColor(suggestion.confidence, colors);

  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Search for ${suggestion.query}`}
      accessibilityHint="Fills the search box and searches"
    >
      <Ionicons name={iconName} size={18} color={colors.textMuted} style={styles.rowIcon} />
      <Text style={styles.rowText} numberOfLines={1}>
        {before ? <Text style={styles.rowTextBase}>{before}</Text> : null}
        {match ? (
          <Text style={[styles.rowTextBase, styles.rowTextMatch]}>{match}</Text>
        ) : null}
        {after ? <Text style={styles.rowTextBase}>{after}</Text> : null}
      </Text>
      <View style={[styles.confidenceDot, { backgroundColor: confidenceColor }]} />
    </Pressable>
  );
});

function splitMatch(term: string, query: string): {
  before: string;
  match: string;
  after: string;
} {
  if (!query) return { before: '', match: '', after: term };
  const lowerTerm = term.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerTerm.indexOf(lowerQuery);
  if (idx < 0) return { before: '', match: '', after: term };
  return {
    before: term.slice(0, idx),
    match: term.slice(idx, idx + query.length),
    after: term.slice(idx + query.length),
  };
}

function confidenceDotColor(confidence: number, colors: ThemeColors): string {
  if (confidence >= 0.75) return colors.success;
  if (confidence >= 0.5) return colors.warning;
  return colors.textMuted;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: Stroke.hairline,
      borderColor: colors.border,
      overflow: 'hidden',
      marginHorizontal: Space.md,
      marginBottom: Space.sm,
    },
    listContent: {
      paddingVertical: Space.xs,
    },
    sectionHeader: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textMuted,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      paddingHorizontal: Space.md,
      paddingVertical: 10,
      gap: Space.sm,
    },
    rowIcon: {
      marginRight: 2,
    },
    rowText: {
      flex: 1,
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    rowTextBase: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    rowTextMatch: {
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },
    confidenceDot: {
      width: 6,
      height: 6,
      borderRadius: Radius.full,
      marginLeft: Space.xs,
    },
    clearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: 8,
      gap: Space.xs,
    },
    clearText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      letterSpacing: 0.15,
    },
    demoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      marginTop: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
      gap: Space.xs,
    },
    demoIcon: {
      marginRight: 2,
    },
    demoText: {
      flex: 1,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      letterSpacing: 0.15,
    },
  });
}
