import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { CachedImage } from '../CachedImage';
import { AppStatusPill } from '../ui/AppStatusPill';
import { Meta, BodyEmphasis, Body } from '../ui/Text';

interface CoOwnAssetCardProps {
  id: string;
  title: string;
  image: string;
  unitPrice: string;
  marketValue: string;
  openValue: string;
  availableUnits: number;
  totalUnits: number;
  marketMovePct24h: number;
  issuerHandle: string;
  issuerAvatar?: string;
  yourUnits?: number;
  isOpen?: boolean;
  onPress?: () => void;
  onBuy?: () => void;
  onSell?: () => void;
  onDetails?: () => void;
  onMessageIssuer?: () => void;
  onViewIssuer?: () => void;
  canMessageIssuer?: boolean;
  isSubmitting?: boolean;
  compact?: boolean;
}

export function CoOwnAssetCard({
  title,
  image,
  unitPrice,
  marketValue,
  openValue,
  availableUnits,
  totalUnits,
  marketMovePct24h,
  issuerHandle,
  issuerAvatar,
  yourUnits = 0,
  isOpen = true,
  onPress,
  onBuy,
  onSell,
  onDetails,
  onMessageIssuer,
  onViewIssuer,
  canMessageIssuer = true,
  isSubmitting = false,
  compact = false,
}: CoOwnAssetCardProps) {
  const isPositive = marketMovePct24h >= 0;
  const isHoldingsMode = yourUnits > 0;
  const primaryDisabled = !isOpen || availableUnits === 0;

  return (
    <View style={styles.container}>
      <AnimatedPressable
        style={styles.primaryTap}
        activeOpacity={0.92}
        onPress={onPress}
        disableAnimation={false}
        scaleValue={0.985}
        accessibilityRole="button"
        accessibilityLabel={`Open ${title} details`}
        accessibilityHint="Shows issuer, chart, and order book details"
      >
        <CachedImage
          uri={image}
          style={styles.assetImage}
          containerStyle={styles.imageContainer}
          contentFit="cover"
        />

        <View style={styles.assetBody}>
          <View style={styles.topRow}>
            <BodyEmphasis style={styles.assetTitle} numberOfLines={1}>
              {title}
            </BodyEmphasis>
            <AppStatusPill
              tone={isPositive ? 'positive' : 'negative'}
              iconName={isPositive ? 'trending-up-outline' : 'trending-down-outline'}
              label={`${isPositive ? '+' : ''}${marketMovePct24h.toFixed(1)}%`}
              size="sm"
            />
          </View>

          <Meta style={styles.assetMeta}>
            {availableUnits} / {totalUnits} shares available
            {yourUnits > 0 && `  |  You hold ${yourUnits}`}
          </Meta>

          {!compact && (
            <View style={styles.statsRow}>
              <View>
                <Meta style={styles.statLabel}>Share Price</Meta>
                <BodyEmphasis style={styles.statValue}>{unitPrice}</BodyEmphasis>
              </View>
              <View>
                <Meta style={styles.statLabel}>Market Value</Meta>
                <BodyEmphasis style={styles.statValue}>{marketValue}</BodyEmphasis>
              </View>
              <View>
                <Meta style={styles.statLabel}>Open Value</Meta>
                <BodyEmphasis style={styles.statValue}>{openValue}</BodyEmphasis>
              </View>
            </View>
          )}
        </View>
      </AnimatedPressable>

      <View style={styles.footer}>
        <View style={styles.issuerRow}>
          <AnimatedPressable
            style={styles.issuerChip}
            onPress={onViewIssuer}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Open @${issuerHandle} profile`}
          >
            {issuerAvatar ? (
              <CachedImage uri={issuerAvatar} style={styles.issuerAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.issuerAvatar, { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 10, fontFamily: Typography.family.bold, color: Colors.textPrimary }}>
                  {issuerHandle.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <Meta style={styles.issuerText} numberOfLines={1}>
              Issuer @{issuerHandle}
            </Meta>
          </AnimatedPressable>

          <AnimatedPressable
            style={[styles.messageBtn, !canMessageIssuer && styles.messageBtnDisabled]}
            onPress={onMessageIssuer}
            disabled={!canMessageIssuer}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={canMessageIssuer ? `Message @${issuerHandle}` : 'Issuer is you'}
          >
            <Ionicons
              name={canMessageIssuer ? 'chatbubble-ellipses-outline' : 'checkmark'}
              size={12}
              color={Colors.textPrimary}
            />
          </AnimatedPressable>
        </View>

        <View style={styles.ctaRow}>
          <AppButton
            style={[styles.buyBtn, (primaryDisabled || isSubmitting) && styles.buyBtnDisabled]}
            onPress={isHoldingsMode ? onSell : onBuy}
            disabled={primaryDisabled || isSubmitting}
            variant="primary"
            size="sm"
            align="center"
            title={isHoldingsMode ? 'Book Profit' : 'Buy Units'}
            icon={
              <Ionicons
                name={isHoldingsMode ? 'cash-outline' : 'wallet-outline'}
                size={13}
                color={!(primaryDisabled || isSubmitting) ? Colors.textInverse : Colors.textMuted}
              />
            }
            hapticFeedback="medium"
            accessibilityLabel={isHoldingsMode ? 'Book profit' : 'Buy units'}
          />

          <AppButton
            style={styles.detailsBtn}
            onPress={onDetails}
            variant="secondary"
            size="sm"
            align="center"
            title="Details"
            hapticFeedback="light"
            accessibilityLabel="View asset details"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  primaryTap: {},
  imageContainer: {
    width: '100%',
    height: 160,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  assetImage: {
    width: '100%',
    height: '100%',
  },
  assetBody: {
    padding: Space.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  assetTitle: {
    flex: 1,
    marginRight: Space.sm,
  },
  assetMeta: {
    marginBottom: Space.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    marginBottom: 2,
  },
  statValue: {
    fontVariant: ['tabular-nums'],
  },
  footer: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
  },
  issuerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  issuerChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 34,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  issuerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  issuerText: {
    flex: 1,
  },
  messageBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Space.sm,
  },
  messageBtnDisabled: {
    opacity: 0.4,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  buyBtn: {
    flex: 1.5,
  },
  buyBtnDisabled: {
    opacity: 0.52,
  },
  detailsBtn: {
    flex: 1,
  },
});