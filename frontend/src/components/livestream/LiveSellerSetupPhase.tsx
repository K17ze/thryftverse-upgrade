/**
 * LiveSellerSetupPhase — the broadcaster setup surface: local camera
 * framing preview, stream title field, and the ordered lot selection over
 * the seller's real active listings, with the go-live footer.
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { useConnectivity } from '../../hooks/useConnectivity';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { OfflineBanner } from '../OfflineBanner';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState,
  SkeletonBlock,
  SkeletonTextLine } from '../flagship';
import { BroadcastPreview } from '../live/BroadcastPreview';
import type { ListingApiItem } from '../../services/listingsApi';
import { useSellerStyles } from './liveSellerStyles';

interface LiveSellerSetupPhaseProps {
  title: string;
  onTitleChange: (text: string) => void;
  listings: ListingApiItem[] | null;
  listingsLoading: boolean;
  listingsError: string | null;
  selectedIds: string[];
  onToggleListing: (listingId: string) => void;
  onRetryListings: () => void;
  onCreateListing: () => void;
  onGoLive: () => void;
  goingLive: boolean;
  setupError: string | null;
  onBack: () => void;
}

export function LiveSellerSetupPhase({
  title,
  onTitleChange,
  listings,
  listingsLoading,
  listingsError,
  selectedIds,
  onToggleListing,
  onRetryListings,
  onCreateListing,
  onGoLive,
  goingLive,
  setupError,
  onBack }: LiveSellerSetupPhaseProps) {
  const { colors } = useAppTheme();
  const { isOffline } = useConnectivity();
  const { currencySymbol, formatFromFiat } = useFormattedPrice();
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const styles = useSellerStyles();

  const showListingsLoading = listingsLoading && listings == null;
  const showListingsError = !listingsLoading && listingsError != null;
  const showListingsEmpty = !listingsLoading && !listingsError && listings != null && listings.length === 0;

  return (
    <FlagshipScreen
      testID="live-seller-setup"
      header={
        <FlagshipHeader
          title="Go live"
          onBack={onBack}
        />
      }
      scrollEnabled={false}
      contentStyle={styles.flushContent}
      stickyFooter={
        <View style={[styles.footer, { paddingBottom: insets.bottom || Space.sm }]}>
          {setupError ? (
            <Text style={[styles.footerError, { color: colors.danger }]}>{setupError}</Text>
          ) : null}
          <AnimatedPressable
            onPress={onGoLive}
            disabled={selectedIds.length === 0 || goingLive || isOffline}
            style={[
              styles.goLiveBtn,
              { backgroundColor: colors.danger },
              (selectedIds.length === 0 || goingLive || isOffline) && { opacity: 0.45 },
            ]}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityLabel="Go live"
            accessibilityState={{ disabled: selectedIds.length === 0 || goingLive || isOffline, busy: goingLive }}
          >
            {goingLive ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={[styles.goLiveBtnText, { color: colors.textInverse }]}>Go live</Text>
            )}
          </AnimatedPressable>
        </View>
      }
    >
      <OfflineBanner onRetry={onRetryListings} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.setupScroll}
      >
        {/* Local camera preview — honest label, real device feed */}
        <BroadcastPreview
          active
          facing="back"
          height={Math.round(SCREEN_HEIGHT * 0.32)}
          accessibilityLabel="Local camera preview"
        />
        <Text style={[styles.previewCaption, { color: colors.textMuted }]}>
          Camera preview — check framing before you go live
        </Text>

        {/* Stream title */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Stream title</Text>
          <TextInput
            style={[styles.titleInput, { color: colors.textPrimary, borderBottomColor: colors.border }]}
            placeholder="e.g. Vintage finds live auction"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={onTitleChange}
            maxLength={60}
            accessibilityLabel="Stream title"
          />
        </View>

        {/* Lot selection — real active listings */}
        <View style={styles.fieldGroup}>
          <View style={styles.lotHeaderRow}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Lots{selectedIds.length > 0 ? ` · ${selectedIds.length} selected` : ''}
            </Text>
          </View>

          {showListingsLoading && (
            <View>
              {Array.from({ length: 4 }).map((_, i) => (
                <View key={`lot-skel-${i}`} style={[styles.lotSelectRow, { borderBottomColor: colors.border }]}>
                  <SkeletonBlock width={48} height={48} radius={Radius.md} />
                  <View style={styles.lotSelectInfo}>
                    <SkeletonTextLine width="65%" height={14} />
                    <SkeletonTextLine width="30%" height={12} />
                  </View>
                </View>
              ))}
            </View>
          )}

          {showListingsError && (
            <FlagshipState
              variant={isOffline ? 'offline' : 'error'}
              title="Listings unavailable"
              subtitle={listingsError ?? undefined}
              actionLabel="Try again"
              onAction={onRetryListings}
            />
          )}

          {showListingsEmpty && (
            <FlagshipState
              variant="empty"
              icon="pricetag-outline"
              title="No active listings"
              subtitle="List an item first — only your active listings can be sold live."
              actionLabel="Create a listing"
              onAction={onCreateListing}
            />
          )}

          {listings != null && listings.length > 0 && (
            <View>
              {listings.map((listing) => {
                const selected = selectedIds.includes(listing.id);
                const order = selectedIds.indexOf(listing.id);
                return (
                  <AnimatedPressable
                    key={listing.id}
                    onPress={() => onToggleListing(listing.id)}
                    style={[styles.lotSelectRow, { borderBottomColor: colors.border }]}
                    hapticFeedback="selection"
                    scaleValue={0.99}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${listing.title}, ${currencySymbol}${listing.priceGbp}`}
                  >
                    {listing.imageUrl || listing.images?.[0] ? (
                      <CachedImage
                        uri={listing.imageUrl ?? listing.images[0]}
                        style={styles.lotSelectThumb}
                        contentFit="cover"
                        accessible={false}
                      />
                    ) : (
                      <View style={[styles.lotSelectThumb, styles.lotSelectThumbFallback, { backgroundColor: colors.surfaceAlt }]}>
                        <AppIcon name="image" size={IconSize.sm} color="textMuted" accessible={false} />
                      </View>
                    )}
                    <View style={styles.lotSelectInfo}>
                      <Text style={[styles.lotSelectTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {listing.title}
                      </Text>
                      <Text style={[styles.lotSelectPrice, { color: colors.textSecondary }]}>
                        {formatFromFiat(listing.priceGbp, 'GBP')}
                      </Text>
                    </View>
                    {selected ? (
                      <View style={[styles.lotOrderMark, { borderColor: colors.brand }]}>
                        <Text style={[styles.lotOrderText, { color: colors.brand }]}>{order + 1}</Text>
                      </View>
                    ) : (
                      <View style={[styles.lotOrderMark, { borderColor: colors.border }]} />
                    )}
                  </AnimatedPressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </FlagshipScreen>
  );
}
