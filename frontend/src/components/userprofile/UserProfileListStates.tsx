import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import type { PublicProfileUser, PublicProfileStorefrontSummary } from '../../services/profileApi';
import type { SellerTrustSummary } from '../../platform/product';
import { UserProfileAboutTab } from './UserProfileAboutTab';
import type { UserProfileTab, UserProfileShopSegment } from '../../hooks/userprofile';

interface UserProfileListStatesProps {
  activeTab: UserProfileTab;
  shopSegment: UserProfileShopSegment;
  isLoading: boolean;
  hasError: boolean;
  isEmpty: boolean;
  onRetry: () => void;
  targetProfile: PublicProfileUser | null;
  storefrontSummary: PublicProfileStorefrontSummary | null;
  sellerTrust?: SellerTrustSummary | null;
}

/**
 * Empty / error content for the profile list. The About tab renders static
 * editorial content instead of a paginated list, so it delegates to
 * UserProfileAboutTab; the other tabs get query-backed loading, retryable
 * error, and per-tab empty states.
 */
export function UserProfileListStates({
  activeTab,
  shopSegment,
  isLoading,
  hasError,
  isEmpty,
  onRetry,
  targetProfile,
  storefrontSummary,
  sellerTrust,
}: UserProfileListStatesProps) {
  const { colors } = useAppTheme();
  const MUTED = colors.textMuted;
  const TEXT = colors.textPrimary;

  if (activeTab === 'About') {
    return (
      <UserProfileAboutTab
        targetProfile={targetProfile}
        storefrontSummary={storefrontSummary}
        sellerTrust={sellerTrust}
      />
    );
  }
  if (isLoading) return null;
  if (hasError) {
    return (
      <AnimatedPressable
        style={styles.listState}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading content"
      >
        <Ionicons name="cloud-offline-outline" size={32} color={MUTED} />
        <Text style={[styles.listStateTitle, { color: TEXT }]}>Couldn't load {activeTab === 'Listings' ? 'listings' : activeTab === 'Looks' ? 'Looks' : 'reviews'}</Text>
        <Text style={[styles.listStateSub, { color: MUTED }]}>Tap to retry</Text>
      </AnimatedPressable>
    );
  }
  if (isEmpty) {
    if (activeTab === 'Listings') {
      return (
        <View style={styles.listState}>
          <Ionicons name="shirt-outline" size={32} color={MUTED} />
          <Text style={[styles.listStateTitle, { color: TEXT }]}>{shopSegment === 'forsale' ? 'No active listings' : 'No sold items yet'}</Text>
          <Text style={[styles.listStateSub, { color: MUTED }]}>{shopSegment === 'forsale' ? 'This seller has nothing for sale right now.' : 'Sold items will appear here.'}</Text>
        </View>
      );
    }
    if (activeTab === 'Looks') {
      return (
        <View style={styles.listState}>
          <Ionicons name="images-outline" size={32} color={MUTED} />
          <Text style={[styles.listStateTitle, { color: TEXT }]}>No published Looks</Text>
          <Text style={[styles.listStateSub, { color: MUTED }]}>This creator hasn't published any Looks yet.</Text>
        </View>
      );
    }
    return (
      <View style={styles.listState}>
        <Ionicons name="chatbubble-ellipses-outline" size={32} color={MUTED} />
        <Text style={[styles.listStateTitle, { color: TEXT }]}>No reviews yet</Text>
        <Text style={[styles.listStateSub, { color: MUTED }]}>Reviews from completed orders will appear here.</Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  listState: { alignItems: 'center', justifyContent: 'center', paddingVertical: Space.xl, paddingHorizontal: Space.md, gap: Space.sm },
  listStateTitle: { fontSize: TypographyV2.bodyStrong.size, fontFamily: FontFamily.semibold },
  listStateSub: { fontSize: TypographyV2.meta.size, fontFamily: FontFamily.regular, textAlign: 'center' },
});
