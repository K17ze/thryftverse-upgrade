import React from 'react';
import {
  View,
  StyleSheet,
  Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// Load-more affordance — previously rendered via SectionList's
// renderSectionFooter. With a single flattened section FlashList's
// ListFooterComponent occupies the same position (after all rows).
export function SellerAuctionLoadMore({
  loadingMore,
  onPress }: {
  loadingMore: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.loadMoreWrap}>
      <AnimatedPressable
        style={styles.loadMoreBtn}
        onPress={onPress}
        disabled={loadingMore}
        scaleValue={0.97}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Load more auctions"
      >
        {loadingMore ? (
          <Text style={styles.loadMoreText}>Loading…</Text>
        ) : (
          <>
            <Ionicons name="chevron-down" size={14} color={colors.brand} />
            <Text style={styles.loadMoreText}>Load more</Text>
          </>
        )}
      </AnimatedPressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  // ── Load more ──
  loadMoreWrap: {
    paddingVertical: Space.lg,
    alignItems: 'center' },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface },
  loadMoreText: {
    fontSize: TypographyV2.body.size,
    color: colors.brand,
    fontFamily: TypographyV2.body.fontFamily } });
}
