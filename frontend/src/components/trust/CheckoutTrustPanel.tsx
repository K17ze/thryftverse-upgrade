/**
 * CheckoutTrustPanel — trust reinforcement panel for checkout.
 *
 * Shows "Secure Payment", "Buyer Protection", and "Authenticity Guarantee"
 * (when applicable) with calm, authoritative language. No generic "100%
 * Safe" claims — only factual, backed statements.
 *
 * Anti-AI / truthful-UI (AGENTS.md §4, §11):
 *  - Flat rows with hairline separators — no card-on-card, no decorative
 *    shields-on-every-row chrome. One icon family, one radius grammar.
 *  - Each statement is factual and tied to a backend-provided policy when
 *    available; missing policies are omitted, never fabricated.
 *  - Calm language: "Payments are processed through encrypted checkout" —
 *    not "100% Secure Guaranteed!".
 *  - Design tokens only.
 *  - `accessibilityRole="summary"` with a composed label.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  deriveSellerTrustProfile,
  selectSignals,
  TRUST_ICON_REGISTRY,
  type TrustSignal,
} from './trustSignals';
import type {
  SellerTrustSummary,
  ListingCommerceContext,
} from '../../platform/product/listingDetailContract';

export interface CheckoutTrustPanelProps {
  seller: SellerTrustSummary | null;
  commerce: ListingCommerceContext | null;
}

interface TrustRow {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  /** When true, the row is backed by a backend verification/policy. */
  verified: boolean;
}

function buildRows(
  signals: TrustSignal[],
  colors: ThemeColors,
): { rows: TrustRow[]; a11y: string } {
  const rows: TrustRow[] = [];

  for (const s of signals) {
    if (s.type === 'secure-payment') {
      rows.push({
        icon: TRUST_ICON_REGISTRY['shield-check'],
        title: 'Secure payment',
        detail: s.description,
        verified: s.verified,
      });
    } else if (s.type === 'buyer-protection') {
      rows.push({
        icon: TRUST_ICON_REGISTRY['umbrella'],
        title: s.label,
        detail: s.description,
        verified: s.verified,
      });
    } else if (s.type === 'authenticity-guarantee') {
      rows.push({
        icon: TRUST_ICON_REGISTRY['ribbon'],
        title: s.label,
        detail: s.description,
        verified: s.verified,
      });
    }
  }

  const a11y = rows
    .map((r) => `${r.title}. ${r.detail}${r.verified ? '. Verified by the platform.' : ''}`)
    .join('. ');

  return { rows, a11y };
}

export function CheckoutTrustPanel({ seller, commerce }: CheckoutTrustPanelProps) {
  const { colors } = useAppTheme();

  const { rows, a11y } = useMemo(() => {
    const profile = deriveSellerTrustProfile(seller, commerce);
    const checkoutSignals = selectSignals(profile.signals, 'checkout');
    return buildRows(checkoutSignals, colors);
  }, [seller, commerce, colors]);

  if (rows.length === 0) return null;

  return (
    <View
      style={[styles.container, { borderColor: colors.borderSubtle }]}
      accessibilityLabel={`Checkout protection. ${a11y}`}
    >
      {rows.map((row, i) => (
        <View
          key={i}
          style={[
            styles.row,
            i < rows.length - 1 && { borderBottomColor: colors.borderSubtle },
          ]}
        >
          <Ionicons name={row.icon} size={16} color={colors.success} />
          <View style={styles.textWrap}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, { color: colors.textPrimary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1}
              >
                {row.title}
              </Text>
              {row.verified && (
                <View style={[styles.verifiedPill, { backgroundColor: colors.successSubtle }]}>
                  <Text style={[styles.verifiedText, { color: colors.success }]}>
                    Verified
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[styles.detail, { color: colors.textSecondary }]}
            >
              {row.detail}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.md,
    borderWidth: Stroke.hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: Control.hit,
    borderBottomWidth: Stroke.hairline,
    borderBottomColor: 'transparent',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    flexShrink: 1,
  },
  verifiedPill: {
    borderRadius: Radius.sm,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 1,
  },
  verifiedText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  detail: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
  },
});
