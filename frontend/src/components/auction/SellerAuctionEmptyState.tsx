import React from 'react';
import {
  View,
  StyleSheet,
  Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { SkeletonLoader } from '../SkeletonLoader';
import { RetryState } from '../RetryState';
import { type SellerTab } from './sellerAuctionCentreViewModels';
import { Space, Radius, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// Empty / loading / error state — rendered for the 'empty' item in the
// flattened FlashList data (mirrors SectionList's ListEmptyComponent, which
// FlashList cannot trigger while `data` is non-empty).
export function SellerAuctionEmptyState({
  loading,
  error,
  activeTab,
  onRetry,
  onCreateAuction }: {
  loading: boolean;
  error: string | null;
  activeTab: SellerTab;
  onRetry: () => void;
  onCreateAuction: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.loadingRow}>
            <SkeletonLoader width={96} height={96} borderRadius={Radius.md} />
            <View style={styles.loadingBody}>
              <View style={styles.loadingTitleRow}>
                <SkeletonLoader width="70%" height={15} borderRadius={Radius.sm} />
                <SkeletonLoader width={40} height={12} borderRadius={Radius.sm} />
              </View>
              <SkeletonLoader width="40%" height={11} borderRadius={Radius.sm} />
              <View style={styles.loadingHairline} />
              <SkeletonLoader width="55%" height={17} borderRadius={Radius.sm} />
              <SkeletonLoader width="35%" height={11} borderRadius={Radius.sm} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  if (error) {
    return (
      <RetryState
        message="Couldn't load auctions. Check your connection and try again."
        onRetry={onRetry}
      />
    );
  }
  const emptyConfig: Record<SellerTab, { title: string; message: string; cta?: string }> = {
    scheduled: {
      title: 'No auctions scheduled',
      message: 'Create an auction when you are ready to sell.',
      cta: 'Create Auction' },
    live: {
      title: 'Nothing live right now',
      message: 'Scheduled auctions will appear here when they begin.' },
    pending: { title: 'No pending results', message: 'Auctions awaiting payment or a confirmed result appear here.' },
    sold: {
      title: 'No completed sales yet',
      message: 'Settled auction sales will appear here.' },
    unsold: {
      title: 'No unsold auctions',
      message: 'Auctions without a sale, including unmet reserves and expired payments, appear here.' },
    cancelled: {
      title: 'No cancelled auctions',
      message: 'Cancelled auctions will remain available here.' } };
  const cfg = emptyConfig[activeTab];
  return (
    <View style={styles.inlineStateWrap}>
      <Text style={styles.inlineStateTitle}>{cfg.title}</Text>
      <Text style={styles.inlineStateMessage}>{cfg.message}</Text>
      {cfg.cta && (
        <AnimatedPressable
          style={styles.inlineCtaBtn}
          onPress={onCreateAuction}
          accessibilityRole="button"
          accessibilityLabel={cfg.cta}
        >
          <Text style={styles.inlineCtaText}>{cfg.cta}</Text>
          <Ionicons name="add" size={15} color={colors.brand} style={styles.inlineCtaIcon} />
        </AnimatedPressable>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  // ── Loading ──
  loadingWrap: {
    paddingTop: Space.md,
    gap: Space.md },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md },
  loadingBody: {
    flex: 1,
    gap: Space.xs },
  loadingTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm },
  loadingHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: Space.xs },
  // ── Inline empty / error states ──
  inlineStateWrap: {
    paddingTop: Space.xl * 2,
    paddingHorizontal: Space.md,
    alignItems: 'flex-start' },
  inlineStateTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary,
    letterSpacing: -0.3 },
  inlineStateMessage: {
    fontSize: TypographyV2.body.size,
    color: colors.textSecondary,
    fontFamily: TypographyV2.body.fontFamily,
    marginTop: Space.xs + 2,
    lineHeight: TypographyV2.body.lineHeight },
  inlineCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brand,
    minHeight: Control.hit },
  inlineCtaPressed: {
    opacity: 0.6 },
  inlineCtaText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.brand },
  inlineCtaIcon: {
    marginTop: Space.xs / 4 } });
}
