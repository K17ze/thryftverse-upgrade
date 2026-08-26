import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { BottomSheet } from '../BottomSheet';
import { Headline, BodyEmphasis } from '../ui/Text';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

const RULES: Array<{ title: string; description: string }> = [
  {
    title: 'Place your bid',
    description:
      "Enter an amount equal to or above the minimum next bid shown. The system accepts your bid instantly if it's higher than the current top bid.",
  },
  {
    title: 'Outbid alerts',
    description:
      "If another bidder places a higher bid, you'll be notified immediately. Come back and place a new bid to reclaim the top spot.",
  },
  {
    title: 'Winning the auction',
    description:
      'When the auction ends, the highest eligible bidder wins. Payment and fulfilment actions appear only when the auction provides them.',
  },
  {
    title: 'Buy Now option',
    description:
      'Some auctions include a Buy Now price. Confirming it records the fixed-price winning bid and ends the auction immediately.',
  },
  {
    title: 'Reserve prices',
    description:
      'Some auctions have a hidden reserve price set by the seller. If the highest bid hasn\'t met the reserve when the auction ends, the seller isn\'t obligated to sell. The "Reserve met" badge means the current top bid has reached or exceeded this threshold.',
  },
  {
    title: 'Currency & payments',
    description:
      'Bids are placed in GBP and automatically converted to your local currency for display. Final settlement uses the 1ZE platform value.',
  },
];

/**
 * How bidding works bottom sheet — static educational content.
 */
export function AuctionRulesSheet({ visible, onDismiss }: Props) {
  const { colors } = useAppTheme();

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoint={0.65}
    >
      <View style={styles.sheetHeader}>
        <Headline style={styles.sheetTitle}>How bidding works</Headline>
      </View>
      <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.rulesContainer}>
          {RULES.map((rule, index) => (
            <View key={index} style={styles.ruleItem}>
              <View style={[styles.ruleNumber, { backgroundColor: colors.brand }]}>
                <Text style={[styles.ruleNumberText, { color: colors.textInverse }]}>{index + 1}</Text>
              </View>
              <View style={styles.ruleContent}>
                <BodyEmphasis style={styles.ruleTitle}>{rule.title}</BodyEmphasis>
                <Text style={[styles.ruleDescription, { color: colors.textSecondary }]}>
                  {rule.description}
                </Text>
              </View>
            </View>
          ))}
          <View style={{ height: Space.xl }} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: Space.md,
  },
  sheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  sheetScroll: {
    flex: 1,
  },
  rulesContainer: {
    gap: Space.lg,
  },
  ruleItem: {
    flexDirection: 'row',
    gap: Space.md,
    alignItems: 'flex-start',
  },
  ruleNumber: {
    width: Space.xl,
    height: Space.xl,
    borderRadius: RadiusRoleValue.pillAvatar,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  ruleNumberText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  ruleContent: {
    flex: 1,
    gap: Space.xs,
  },
  ruleTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  ruleDescription: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
  },
});
