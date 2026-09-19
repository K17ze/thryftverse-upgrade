import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { Listing } from '../../domain';

export interface ClosetGridProps {
  listings: Listing[];
  reorderMode: boolean;
  isSaving: boolean;
  reducedMotion: boolean;
  onToggleReorder: () => void;
  onViewAll: () => void;
  onStartSelling: () => void;
  onImport: () => void;
  renderItem: (info: { item: Listing; index: number }) => React.ReactElement;
}

/**
 * Listings tab body — portfolio grid with reorder/pin controls and empty states.
 * Extracted from MyProfileScreen to isolate the closet grid domain.
 */
/** Preview cap for the nested grid (F20): this FlashList renders inside the
 *  screen's ScrollView with scrollEnabled={false}, so every cell mounts
 *  eagerly — an unbounded closet stalls the whole profile. The profile grid
 *  is a preview; "View all" deep-links to MyListings. Reorder mode keeps the
 *  full set visible since the user is explicitly managing featured order. */
const PREVIEW_LIMIT = 12;

export function ClosetGrid({
  listings,
  reorderMode,
  isSaving,
  reducedMotion,
  onToggleReorder,
  onViewAll,
  onStartSelling,
  onImport,
  renderItem }: ClosetGridProps) {
  const { colors } = useAppTheme();
  const { t: tt } = useAppTranslation('myProfile');
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const visibleListings = reorderMode ? listings : listings.slice(0, PREVIEW_LIMIT);
  const isCapped = !reorderMode && listings.length > visibleListings.length;

  return (
    <Reanimated.View
      key="listings"
      entering={reducedMotion ? undefined : FadeIn.duration(200)}
      style={{ backgroundColor: colors.background, paddingBottom: 100, paddingTop: Space.md }}
    >
      {listings.length === 0 ? (
        <View style={styles.listingsEmpty}>
          <Ionicons name="bag-add-outline" size={28} color={colors.textSecondary} aria-hidden={true} />
          <Text style={styles.listingsEmptyTitle}>{tt('listings.emptyTitle')}</Text>
          <Text style={styles.listingsEmptyBody} maxFontSizeMultiplier={2}>
            {tt('listings.emptyBody')}
          </Text>
          <AnimatedPressable
            style={styles.listingsEmptyCta}
            onPress={onStartSelling}
            accessibilityRole="button"
            accessibilityLabel="Start selling"
            hitSlop={1}
          >
            <Text style={styles.listingsEmptyCtaText}>{tt('listings.startSelling')}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.listingsEmptyImportLink}
            onPress={onImport}
            accessibilityRole="button"
            accessibilityLabel={tt('listings.bringOverListings')}
            accessibilityHint={tt('accessibility.importListingsHint')}
            hitSlop={8}
          >
            <Text style={styles.listingsEmptyImportText} maxFontSizeMultiplier={2}>
              {tt('listings.bringOverListings')}
            </Text>
          </AnimatedPressable>
        </View>
      ) : (
        <>
          <View style={styles.gridHeader}>
            <Text style={styles.gridHeaderCount}>{tt('listings.listingsCount', { count: listings.length })}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.md }}>
              {/* G4: Reorder-mode toggle — "Edit" enters, "Done" saves & exits */}
              <Pressable
                onPress={onToggleReorder}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel={reorderMode ? tt('listings.done') : tt('listings.editOrder')}
                hitSlop={13}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Text style={styles.gridHeaderAction} maxFontSizeMultiplier={2}>
                    {reorderMode ? tt('listings.done') : tt('listings.editOrder')}
                  </Text>
                )}
              </Pressable>
              {!reorderMode ? (
                <Pressable
                  onPress={onViewAll}
                  accessibilityRole="button"
                  accessibilityLabel="View all listings"
                  hitSlop={13}
                >
                  <Text style={styles.gridHeaderAction}>{tt('listings.viewAll')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <FlashList
            data={visibleListings}
            numColumns={3}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            scrollEnabled={false}
          />
          {/* Deep-link to the full closet when the preview is capped — the
              trailing affordance keeps the complete collection reachable
              from the end of the grid (F20). */}
          {isCapped ? (
            <Pressable
              onPress={onViewAll}
              accessibilityRole="button"
              accessibilityLabel={`View all ${listings.length} listings`}
              hitSlop={8}
              style={styles.viewAllFooter}
            >
              <Text style={styles.viewAllFooterText} maxFontSizeMultiplier={2}>
                {tt('listings.viewAll')} ({listings.length})
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </Reanimated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    gridHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      marginBottom: Space.sm },
    gridHeaderCount: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'] as ['tabular-nums'] },
    gridHeaderAction: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand },
    // Trailing "View all" affordance after a capped preview grid (F20).
    viewAllFooter: {
      alignItems: 'center',
      paddingVertical: Space.md,
      paddingHorizontal: Space.md },
    viewAllFooterText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand },

    // Listings empty state — compact in-grid prompt, not full blank page
    listingsEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.xl + Space.sm,
      paddingHorizontal: Space.md,
      gap: Space.sm },
    listingsEmptyTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: FontFamily.semibold,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textPrimary },
    listingsEmptyBody: {
      maxWidth: 280,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      textAlign: 'center',
      color: colors.textMuted },
    listingsEmptyCta: {
      marginTop: Space.xs + 2,
      minHeight: Control.hit,
      paddingHorizontal: Space.md + 2,
      justifyContent: 'center',
      borderRadius: RadiusRoleValue.sheetDialog,
      backgroundColor: colors.brand },
    listingsEmptyCtaText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.textInverse },
    listingsEmptyImportLink: {
      marginTop: Space.sm,
      minHeight: Control.hit,
      justifyContent: 'center',
      paddingHorizontal: Space.sm },
    listingsEmptyImportText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      lineHeight: TypographyV2.body.lineHeight,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.brand } });
}
