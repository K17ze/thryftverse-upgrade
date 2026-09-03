/**
 * HelpShortcutsSheet — discoverability sheet for creator keyboard shortcuts.
 *
 * Per spec 09 (Visual System / Motion / Accessibility): existing
 * desktop/tablet shortcuts are useful. Add discoverability under
 * Help/Shortcuts rather than requiring memory.
 *
 * Lists the real keyboard handlers that exist in the poster + look
 * composer screens. Per AGENTS.md §11 (truthful UI), only shortcuts that
 * actually perform an action are documented — no fabricated entries.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SheetContainer, PressScale } from '../CreatorAnimations';
import { Space, Radius, FontFamily, Stroke, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';

export interface HelpShortcutsSheetProps {
  visible: boolean;
  onClose: () => void;
}

// ── Shortcut data ───────────────────────────────────────────────────
// Only shortcuts that actually exist in the composer keyboard handlers
// are listed here (AGENTS.md §11 — truthful UI).

interface ShortcutEntry {
  keys: string;
  label: string;
}

interface ShortcutCategory {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  entries: ShortcutEntry[];
}

const CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Navigation',
    icon: 'navigate-outline',
    entries: [
      { keys: 'Esc', label: 'Close sheet · deselect · back' },
    ] },
  {
    title: 'Editing',
    icon: 'create-outline',
    entries: [
      { keys: 'Delete', label: 'Delete selected layer' },
      { keys: '⌫', label: 'Backspace also deletes selection' },
    ] },
  {
    title: 'Tools',
    icon: 'construct-outline',
    entries: [
      // No tool-switching keyboard shortcuts exist yet — the tool rail
      // is the primary input. Documented honestly per AGENTS.md §11.
      { keys: '—', label: 'Use the tool rail to switch tools' },
    ] },
  {
    title: 'History',
    icon: 'time-outline',
    entries: [
      { keys: '⌘Z', label: 'Undo' },
      { keys: '⌘⇧Z', label: 'Redo' },
    ] },
];

export function HelpShortcutsSheet({ visible, onClose }: HelpShortcutsSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  const handleClose = () => {
    haptic.light();
    onClose();
  };

  return (
    <SheetContainer visible={visible} onClose={handleClose} maxHeight={0.78}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Help & Shortcuts
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Keyboard shortcuts for web & tablet
            </Text>
          </View>
        </View>

        {/* Shortcut categories */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {CATEGORIES.map((cat) => (
            <View key={cat.title} style={styles.category}>
              <View style={styles.categoryHeader}>
                <Ionicons name={cat.icon} size={IconGrammar.metadata} color={colors.textSecondary} />
                <Text style={[styles.categoryTitle, { color: colors.textSecondary }]}>
                  {cat.title}
                </Text>
              </View>
              <View style={styles.entryList}>
                {cat.entries.map((entry, i) => (
                  <View
                    key={`${cat.title}-${entry.keys}-${i}`}
                    style={[
                      styles.entryRow,
                      i < cat.entries.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
                    ]}
                  >
                    <Text style={[styles.entryLabel, { color: colors.textPrimary }]}>
                      {entry.label}
                    </Text>
                    <Text style={[styles.keyText, { color: colors.textSecondary }]}>
                      {entry.keys}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Got it button */}
        <View style={styles.footer}>
          <PressScale
            onPress={handleClose}
            style={[styles.gotItBtn, { backgroundColor: colors.brand }]}
            accessibilityLabel="Close"
            accessibilityHint="Closes the help and shortcuts sheet"
            accessibilityRole="button"
          >
            <Text style={[styles.gotItText, { color: colors.surface }]}>
              Close
            </Text>
          </PressScale>
        </View>
      </View>
    </SheetContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md },
  header: {
    paddingVertical: Space.sm },
  headerText: {
    flex: 1 },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    marginTop: 2 },
  scroll: {
    marginTop: Space.sm },
  scrollContent: {
    paddingBottom: Space.lg },
  category: {
    marginBottom: Space.md },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.xs,
    paddingHorizontal: Space.xs },
  categoryTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase' },
  entryList: {
    overflow: 'hidden' },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.xs,
    minHeight: 44 },
  entryLabel: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  keyText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    letterSpacing: 0.2 },
  footer: {
    paddingTop: Space.sm,
    paddingBottom: Space.xs },
  gotItBtn: {
    height: 50,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center' },
  gotItText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    letterSpacing: 0.12 } });
