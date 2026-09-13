import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { GRID_COLS } from '../../hooks/myprofile';
import type { Listing } from '../../domain';

export interface ClosetGridItemProps {
  item: Listing;
  index: number;
  cardHeight: number;
  isReorderMode: boolean;
  isFeatured: boolean;
  featuredRank: number;
  priceLabel: string;
  onPress: () => void;
  onTogglePin: () => void;
  onShiftLeft: () => void;
  onShiftRight: () => void;
}

/**
 * Single closet-grid cell — listing media with pinned badge, sold overlay and
 * reorder-mode controls (rank badge, pin toggle, shift arrows). Extracted
 * from MyProfileScreen's renderListingItem; FlashList tuning stays in
 * ClosetGrid.
 */
export function ClosetGridItem({
  item,
  index,
  cardHeight,
  isReorderMode,
  isFeatured,
  featuredRank,
  priceLabel,
  onPress,
  onTogglePin,
  onShiftLeft,
  onShiftRight }: ClosetGridItemProps) {
  const { colors } = useAppTheme();
  const { t: tt } = useAppTranslation('myProfile');
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const colIndex = index % GRID_COLS;

  return (
    <View
      style={{
        paddingLeft: colIndex === 0 ? Space.md : Space.xs / 2,
        paddingRight: colIndex === 2 ? Space.md : Space.xs / 2,
        paddingBottom: Space.sm,
      }}
    >
      <AnimatedPressable
        style={styles.gridCard}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Manage ${item.title}${isFeatured ? ', pinned' : ''}`}
      >
        <SharedTransitionView
          style={[styles.gridImageWrap, { height: cardHeight }]}
          sharedTransitionTag={`image-${item.id}-0`}
        >
          <CachedImage
            uri={item.images?.[0] ?? ''}
            style={styles.gridImage}
            containerStyle={{ width: '100%', height: '100%', borderRadius: RadiusRoleValue.compactControl }}
            contentFit="cover"
          />
          {isFeatured ? (
            <View style={styles.pinnedBadge} pointerEvents="none">
              <Ionicons name="pin" size={12} color={colors.scrimTextPrimary} aria-hidden={true} />
            </View>
          ) : null}
          {item.isSold ? (
            <View style={styles.soldOverlay}>
              <Text style={styles.soldText}>{tt('listings.sold')}</Text>
            </View>
          ) : null}

          {/* ── Reorder-mode controls ── */}
          {isReorderMode ? (
            <View style={styles.reorderOverlay} pointerEvents="box-none">
              {/* Rank badge for featured items */}
              {isFeatured ? (
                <View style={styles.rankBadge} pointerEvents="none">
                  <Text
                    style={styles.rankBadgeText}
                    maxFontSizeMultiplier={1.3}
                  >
                    {featuredRank}
                  </Text>
                </View>
              ) : null}

              {/* Pin/unpin toggle — top-right */}
              <Pressable
                style={styles.reorderPinBtn}
                onPress={onTogglePin}
                accessibilityRole="button"
                accessibilityLabel={isFeatured ? tt('listings.unpin') : tt('listings.pin')}
                hitSlop={4}
              >
                <View style={styles.reorderPinVisible}>
                  <Ionicons
                    name={isFeatured ? 'pin' : 'pin-outline'}
                    size={16}
                    color={colors.scrimTextPrimary}
                    aria-hidden={true}
                  />
                </View>
              </Pressable>

              {/* Shift arrows — bottom-center for featured items */}
              {isFeatured ? (
                <View style={styles.reorderShiftRow} pointerEvents="box-none">
                  <Pressable
                    style={styles.reorderShiftBtn}
                    onPress={onShiftLeft}
                    accessibilityRole="button"
                    accessibilityLabel={tt('listings.shiftLeft')}
                    hitSlop={4}
                  >
                    <View style={styles.reorderShiftVisible}>
                      <Ionicons name="chevron-back" size={16} color={colors.scrimTextPrimary} aria-hidden={true} />
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.reorderShiftBtn}
                    onPress={onShiftRight}
                    accessibilityRole="button"
                    accessibilityLabel={tt('listings.shiftRight')}
                    hitSlop={4}
                  >
                    <View style={styles.reorderShiftVisible}>
                      <Ionicons name="chevron-forward" size={16} color={colors.scrimTextPrimary} aria-hidden={true} />
                    </View>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
        </SharedTransitionView>
        <Text style={styles.gridPrice} numberOfLines={1} maxFontSizeMultiplier={2}>
          {priceLabel}
        </Text>
        {item.brand ? (
          <Text style={styles.gridBrand} numberOfLines={1}>{item.brand}</Text>
        ) : null}
      </AnimatedPressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    gridCard: {
      marginBottom: Space.sm },
    gridImageWrap: {
      borderRadius: RadiusRoleValue.mediaThumbnail,
      overflow: 'hidden',
      position: 'relative' },
    pinnedBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      width: 20,
      height: 20,
      borderRadius: RadiusRoleValue.pillAvatar,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay },
    // ── G4: Reorder-mode overlay controls ──
    reorderOverlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 4 },
    rankBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: RadiusRoleValue.pillAvatar,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay },
    rankBadgeText: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: FontFamily.bold,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
      color: colors.scrimTextPrimary },
    reorderPinBtn: {
      position: 'absolute',
      top: 4,
      right: 4 },
    reorderPinVisible: {
      width: Space.xl - 2,
      height: Space.xl - 2,
      borderRadius: RadiusRoleValue.standalonePanel,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay },
    reorderShiftRow: {
      position: 'absolute',
      bottom: 6,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Space.xs },
    reorderShiftBtn: {},
    reorderShiftVisible: {
      width: Space.xl - 2,
      height: Space.xl - 2,
      borderRadius: RadiusRoleValue.standalonePanel,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay },
    gridImage: {
      width: '100%',
      height: '100%' },
    soldOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay },
    soldText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      letterSpacing: LetterSpacing.caps + 0.18,
      color: colors.scrimTextPrimary },
    gridPrice: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      marginTop: Space.xs + 1,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
      color: colors.textPrimary },
    gridBrand: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      marginTop: 1,
      color: colors.textSecondary } });
}
