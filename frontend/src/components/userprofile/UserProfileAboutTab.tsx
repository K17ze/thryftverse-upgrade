import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { PublicProfileUser, PublicProfileStorefrontSummary } from '../../services/profileApi';
import type { SellerTrustSummary } from '../../platform/product';

interface UserProfileAboutTabProps {
  targetProfile: PublicProfileUser | null;
  storefrontSummary: PublicProfileStorefrontSummary | null;
  sellerTrust?: SellerTrustSummary | null;
}

/**
 * About tab — static editorial content, not a paginated list.
 * Renders bio, website, shop policies and trust signals. Bypasses the
 * loading/error/empty states of the listing queries since the data is
 * already resolved by the public profile aggregate.
 */
export function UserProfileAboutTab({ targetProfile, storefrontSummary, sellerTrust }: UserProfileAboutTabProps) {
  const { colors } = useAppTheme();
  const MUTED = colors.textMuted;
  const TEXT = colors.textPrimary;
  const BORDER = colors.border;

  const bio = targetProfile?.bio?.trim();
  const website = targetProfile?.website?.trim();
  const hasPolicies = Boolean(sellerTrust);
  const hasAboutContent = Boolean(bio || website || hasPolicies || storefrontSummary?.announcement?.trim());
  if (!hasAboutContent) {
    return (
      <View style={styles.listState}>
        <Text style={[styles.listStateTitle, { color: TEXT }]}>No additional details</Text>
        <Text style={[styles.listStateSub, { color: MUTED }]}>This seller hasn't added an about section yet.</Text>
      </View>
    );
  }
  return (
    <View style={{ paddingTop: Space.md, paddingBottom: 100 }}>
      {storefrontSummary?.announcement?.trim() ? (
        <View style={styles.aboutContainer}>
          <Text style={[styles.announcementText, { color: TEXT }]}>
            {storefrontSummary.announcement.trim()}
          </Text>
        </View>
      ) : null}

      {bio ? (
        <View style={styles.aboutContainer}>
          <Text style={[styles.aboutSectionTitle, { color: TEXT }]}>About</Text>
          <Text style={[styles.aboutBio, { color: TEXT }]}>{bio}</Text>
        </View>
      ) : null}

      {website ? (
        <View style={styles.aboutContainer}>
          <View style={[styles.aboutRow, { borderBottomColor: BORDER }, styles.aboutRowLast]}>
            <Text style={[styles.aboutLabel, { color: MUTED }]}>Website</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs }}>
              <Text style={[styles.aboutValue, { color: TEXT }, { flexShrink: 1 }]} numberOfLines={1}>{website}</Text>
              <Ionicons name="open-outline" size={12} color={MUTED} aria-hidden={true} />
            </View>
          </View>
        </View>
      ) : null}

      {/* Shop policies — dispatch/response details from seller trust. */}
      <View style={styles.aboutContainer}>
        <Text style={[styles.aboutSectionTitle, { color: TEXT }]}>Shop policies</Text>
        <View style={[styles.aboutRow, { borderBottomColor: BORDER }]}>
          <Text style={[styles.aboutLabel, { color: MUTED }]}>Payments</Text>
          <Text style={[styles.aboutValue, { color: TEXT }]}>Secure checkout with buyer protection</Text>
        </View>
        <View style={[styles.aboutRow, { borderBottomColor: BORDER }]}>
          <Text style={[styles.aboutLabel, { color: MUTED }]}>Shipping</Text>
          <Text style={[styles.aboutValue, { color: TEXT }]}>
            {sellerTrust?.dispatchTimeLabel
              ? `Seller ${sellerTrust.dispatchTimeLabel.toLowerCase()}. Tracking provided on dispatch.`
              : 'Tracking provided on dispatch.'}
          </Text>
        </View>
        <View style={[styles.aboutRow, { borderBottomColor: BORDER }]}>
          <Text style={[styles.aboutLabel, { color: MUTED }]}>Returns</Text>
          <Text style={[styles.aboutValue, { color: TEXT }]}>Returns accepted for items not as described.</Text>
        </View>
        {sellerTrust?.responseRate !== null && sellerTrust?.responseRate !== undefined ? (
          <View style={[styles.aboutRow, { borderBottomColor: BORDER }]}>
            <Text style={[styles.aboutLabel, { color: MUTED }]}>Response rate</Text>
            <Text style={[styles.aboutValue, { color: TEXT }]}>{sellerTrust.responseRate}%</Text>
          </View>
        ) : null}
        <View style={[styles.aboutRow, { borderBottomColor: BORDER }, styles.aboutRowLast]}>
          <Text style={[styles.aboutLabel, { color: MUTED }]}>Response</Text>
          <Text style={[styles.aboutValue, { color: TEXT }]}>
            {sellerTrust?.responseTimeLabel
              ? `Seller typically replies ${sellerTrust.responseTimeLabel.toLowerCase()}.`
              : 'Seller aims to respond promptly.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  listState: { alignItems: 'center', justifyContent: 'center', paddingVertical: Space.xl, paddingHorizontal: Space.md, gap: Space.sm },
  listStateTitle: { fontSize: TypographyV2.bodyStrong.size, fontFamily: FontFamily.semibold },
  listStateSub: { fontSize: TypographyV2.meta.size, fontFamily: FontFamily.regular, textAlign: 'center' },
  announcementText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight,
  },
  // About tab — flat editorial rows, mirroring MyProfile About composition.
  aboutContainer: { paddingHorizontal: Space.md },
  aboutSectionTitle: {
    fontSize: TypographyV2.label.size,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.label.letterSpacing,
    paddingTop: Space.md + 4,
    paddingBottom: Space.sm },
  aboutBio: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight },
  aboutRow: {
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.xs },
  aboutRowLast: { borderBottomWidth: 0 },
  aboutLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.label.letterSpacing },
  aboutValue: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.body.lineHeight },
});
