/**
 * CommandPalette — Linear-style mobile ⌘K command surface.
 *
 * Full-screen modal with a thumb-reachable card anchored to the top of the
 * screen. Real-time fuzzy search across navigation targets, primary actions,
 * search surfaces, settings and help commands. Backdrop tap closes. Each row
 * is a 48pt target with pressed feedback, accessibility labels and chevron
 * affordance.
 *
 * The command catalog is sourced from the dedicated registry service
 * (`services/commandPaletteApi`) so it can be unit-tested and reused outside
 * the UI. Recent commands are persisted via `useCommandPalette`.
 *
 * Truthful by design (AGENTS.md §11): every command maps to a real screen or
 * a real preference toggle. No fabricated destinations, no "Coming soon".
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Keyboard,
  useWindowDimensions,
  ViewStyle,
  TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  SlideInDown,
  SlideOutUp } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  Space,
  Radius,
  Elevation,
  Control,
  ZIndex } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useCommandPaletteStore, useCommandPalette } from '../hooks/useCommandPalette';
import type { RootStackParamList } from '../navigation/types';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  getCommands,
  searchCommands,
  groupCommandsByCategory,
  type Command,
  type CommandCategory,
  type CommandNavigation } from '../services/commandPaletteApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IconName = keyof typeof Ionicons.glyphMap;

interface CommandSection {
  key: string;
  label: string;
  commands: Command[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Debounce window for search input (ms). Keeps typing responsive while
 *  avoiding a re-filter on every keystroke. */
const SEARCH_DEBOUNCE_MS = 120;
const MAX_RESULTS_PER_SECTION = 8;
const ROW_HEIGHT = 48;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const visible = useCommandPaletteStore((s) => s.visible);
  const close = useCommandPaletteStore((s) => s.close);
  const { recentScreens, recentSearches, recentCommands, recordCommand } =
    useCommandPalette();
  const { colors } = useAppTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();

  const [query, setQuery] = useState('');
  // Debounced query — the actual value used to filter results.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Adapt the React Navigation prop to the minimal surface the registry
  // needs. This keeps the service decoupled from React Navigation types.
  const commandNav: CommandNavigation = useMemo(
    () => ({
      navigate: (route: string, params?: Record<string, unknown>) => {
        // The registry only knows string route names; cast through the
        // loose navigation surface so the service stays decoupled from
        // the concrete RootStackParamList overloads.
        (navigation.navigate as unknown as (
          r: string,
          p?: Record<string, unknown>,
        ) => void)(route, params);
      } }),
    [navigation],
  );

  // Build the full command catalog (bound to the current navigation).
  const allCommands = useMemo(() => getCommands(commandNav), [commandNav]);

  // A lookup so recent-command ids can resolve back to their Command.
  const commandById = useMemo(() => {
    const map = new Map<string, Command>();
    for (const c of allCommands) map.set(c.id, c);
    return map;
  }, [allCommands]);

  // Reset query & highlight whenever the palette opens/closes.
  useEffect(() => {
    if (visible) {
      setQuery('');
      setDebouncedQuery('');
      setHighlightedIndex(0);
    }
  }, [visible]);

  // Auto-focus the input shortly after opening (let the modal settle).
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [visible]);

  // Debounce the raw query into the value used for filtering.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // Build the "recent" section from persisted data (commands, screens, searches).
  const recentItems: Command[] = useMemo(() => {
    const items: Command[] = [];

    // Recently executed commands (Linear-style "recent commands").
    for (const id of recentCommands) {
      const match = commandById.get(id);
      if (match) {
        items.push({
          ...match,
          id: `recent-cmd-${match.id}`,
          subtitle: 'Recently used' });
      }
    }

    // Recently visited screens — reuse a matching catalog command when
    // possible so the icon + action stay consistent.
    for (const entry of recentScreens) {
      const match = allCommands.find(
        (n) =>
          n.label === entry.title ||
          n.id === `nav-${entry.name.toLowerCase()}`,
      );
      if (match) {
        items.push({
          ...match,
          id: `recent-screen-${entry.name}`,
          subtitle: 'Recently visited' });
      }
    }

    // Recently searched queries — navigate to UnifiedDiscovery.
    for (const term of recentSearches) {
      if (!term) continue;
      items.push({
        id: `recent-search-${term}`,
        label: term,
        subtitle: 'Recent search',
        category: 'search',
        icon: 'time-outline',
        action: () => navigation.navigate('UnifiedDiscovery'),
        keywords: [term] });
    }
    return items;
  }, [recentCommands, recentScreens, recentSearches, allCommands, commandById, navigation]);

  // Build all sections, then filter by the debounced query.
  const sections: CommandSection[] = useMemo(() => {
    // When there is no query, show recent first, then the full catalog
    // grouped by category (Linear shows recent + default sections).
    if (!debouncedQuery.trim()) {
      const recentSection: CommandSection[] =
        recentItems.length > 0
          ? [{ key: 'recent', label: 'Recent', commands: recentItems }]
          : [];
      const catalogSections = groupCommandsByCategory(allCommands).map((s) => ({
        key: s.category,
        label: s.label,
        commands: s.commands }));
      return [...recentSection, ...catalogSections];
    }

    // Filtered results — search the full catalog plus recent items together
    // so a recent command can still be found by typing.
    const pooled = [...allCommands, ...recentItems];
    const filtered = searchCommands(debouncedQuery, pooled);
    const grouped = groupCommandsByCategory(filtered);
    return grouped.map((s) => ({
      key: s.category,
      label: s.label,
      commands: s.commands.slice(0, MAX_RESULTS_PER_SECTION) }));
  }, [debouncedQuery, allCommands, recentItems]);

  // Flatten for highlight navigation.
  const flatCommands = useMemo(
    () => sections.flatMap((s) => s.commands),
    [sections],
  );

  // Keep highlight in range as results change.
  useEffect(() => {
    if (highlightedIndex >= flatCommands.length) {
      setHighlightedIndex(0);
    }
  }, [flatCommands.length, highlightedIndex]);

  const executeCommand = useCallback(
    (command: Command) => {
      haptic.light();
      // Record the original command id (strip the `recent-cmd-` / `recent-screen-`
      // prefixes so we persist the underlying command, not the wrapper).
      const originalId = command.id.replace(/^recent-(cmd|screen|search)-/, '');
      // Only record catalog commands (not raw recent-search terms).
      if (commandById.has(originalId) || allCommands.some((c) => c.id === originalId)) {
        void recordCommand(originalId);
      }
      close();
      // Defer navigation until after the modal dismisses to avoid jank.
      requestAnimationFrame(() => command.action());
    },
    [close, haptic, recordCommand, commandById, allCommands],
  );

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    close();
  }, [close]);

  const handleClear = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Card height — thumb-reachable, never more than ~62% of the screen.
  const cardMaxHeight = Math.min(screenHeight * 0.62, 560);

  const hasResults = sections.length > 0;
  const totalResults = flatCommands.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close">
        <Reanimated.View
          entering={reducedMotion ? undefined : SlideInDown.springify().damping(18).stiffness(260)}
          exiting={reducedMotion ? undefined : SlideOutUp.duration(180)}
          style={styles.cardWrapper}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.card, { maxHeight: cardMaxHeight }]}
            accessibilityRole="combobox"
            accessibilityLabel="Command palette"
            accessibilityHint="Search for screens, actions and settings. Double tap a result to run it."
          >
            {/* Search header */}
            <View style={styles.searchHeader}>
              <Ionicons name="search-outline" size={Control.iconCompact} color={colors.textMuted} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder="Search commands, screens, actions…"
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel="Command palette search"
                accessibilityRole="search"
                accessibilityHint="Type to search across navigation, actions, search, settings and help"
              />
              {query.length > 0 ? (
                <Pressable
                  onPress={handleClear}
                  hitSlop={8}
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  accessibilityHint="Removes the current search text"
                >
                  <Ionicons name="close-circle" size={Control.iconCompact} color={colors.textMuted} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleClose}
                hitSlop={8}
                accessibilityLabel="Close command palette"
                accessibilityRole="button"
                accessibilityHint="Closes the command palette"
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={Control.iconCompact} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.headerHairline} />

            {/* Results */}
            {hasResults ? (
              <ScrollView
                ref={scrollRef}
                style={styles.resultsScroll}
                contentContainerStyle={styles.resultsContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                accessibilityRole="list"
                accessibilityLabel="Command results"
              >
                {sections.map((section) => (
                  <View key={section.key} style={styles.section}>
                    <Text
                      style={styles.sectionHeader}
                      accessibilityRole="header"
                    >
                      {section.label}
                    </Text>
                    {section.commands.map((command) => {
                      const flatIndex = flatCommands.findIndex(
                        (f) => f.id === command.id,
                      );
                      const isHighlighted = flatIndex === highlightedIndex;
                      return (
                        <CommandRow
                          key={command.id}
                          command={command}
                          highlighted={isHighlighted}
                          onPress={() => executeCommand(command)}
                          colors={colors}
                        />
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View
                style={styles.emptyState}
                accessibilityRole="text"
                accessibilityLabel={`No results for ${debouncedQuery}`}
              >
                <Ionicons name="search-outline" size={32} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No results</Text>
                <Text style={styles.emptySubtitle}>
                  Try a different search term
                </Text>
              </View>
            )}

            {/* Footer hint — result count + esc affordance */}
            {hasResults ? (
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  {totalResults} {totalResults === 1 ? 'result' : 'results'}
                </Text>
                <Text style={styles.footerHint}>Tap backdrop to close</Text>
              </View>
            ) : null}
          </Pressable>
        </Reanimated.View>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface CommandRowProps {
  command: Command;
  highlighted: boolean;
  onPress: () => void;
  colors: ThemeColors;
}

const CommandRow = React.memo(function CommandRow({
  command,
  highlighted,
  onPress,
  colors }: CommandRowProps) {
  const styles = useMemo(() => createRowStyles(colors), [colors]);
  const iconName = (command.icon as IconName | undefined) ?? 'square-outline';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.row,
        highlighted && styles.rowHighlighted,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={command.label}
      accessibilityHint={command.subtitle ?? command.category}
    >
      <Ionicons
        name={iconName}
        size={Control.icon}
        color={highlighted ? colors.textPrimary : colors.textSecondary}
        style={styles.rowIcon}
      />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {command.label}
        </Text>
        {command.subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {command.subtitle}
          </Text>
        ) : null}
      </View>
      {command.shortcut ? (
        <Text style={styles.shortcut}>{command.shortcut}</Text>
      ) : null}
      <Ionicons
        name="chevron-forward"
        size={16}
        color={colors.textMuted}
        style={styles.chevron}
      />
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      zIndex: ZIndex.overlay },
    cardWrapper: {
      paddingTop: 0 },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      marginTop: 0,
      // Anchor to the top of the screen — thumb-reachable.
      ...Elevation.modal,
      overflow: 'hidden' },
    searchHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    searchInput: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.body.letterSpacing,
      paddingVertical: Space.xs },
    closeBtn: {
      paddingHorizontal: Space.xs,
      paddingVertical: Space.xs },
    headerHairline: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border },
    resultsScroll: {
      flex: 1 },
    resultsContent: {
      paddingBottom: Space.sm },
    section: {
      // Flat canvas — no per-section surface (AGENTS.md §4 surface budget).
    },
    sectionHeader: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.label.letterSpacing,
      textTransform: 'uppercase',
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.xs },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.xl,
      gap: Space.xs },
    emptyTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary },
    emptySubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle },
    footerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing },
    footerHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing } });
}

function createRowStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW_HEIGHT,
      paddingHorizontal: Space.md,
      gap: Space.sm,
      minHeight: 44, // AGENTS.md §13 — minimum practical touch target
    },
    rowHighlighted: {
      backgroundColor: colors.surfaceAlt },
    rowPressed: {
      backgroundColor: colors.rowPressed },
    rowIcon: {
      width: Control.icon + Space.xs },
    rowText: {
      flex: 1,
      flexDirection: 'column',
      justifyContent: 'center' },
    rowTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing },
    rowSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginTop: 1 },
    shortcut: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginRight: Space.xs },
    chevron: {
      // Transparent chevron — utility chrome recedes (AGENTS.md §4).
    } });
}
