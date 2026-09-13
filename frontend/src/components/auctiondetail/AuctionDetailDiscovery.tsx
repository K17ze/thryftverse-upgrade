import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { toIze, formatIzeAmount } from '../../utils/currency';
import { Space } from '../../theme/designTokens';
import { CommerceRelatedRail } from '../commerce';
import { RecommendationRail } from '../product';
import { openProductDetail } from '../../platform/product/openProductDetail';
import { resolveAuctionTiming } from '../../hooks/useServerClock';
import {
  useRecommendations,
  isRecommendationLook,
} from '../../platform/product';
import type { RecommendationLook } from '../../platform/product';
import type { AuctionDetail, MarketAuction } from '../../services/marketApi';
import type { Listing } from '../../services/listingsApi';
import type { RootStackParamList } from '../../navigation/types';

type NavT = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  auction: AuctionDetail;
  relatedAuctions: MarketAuction[];
  secondClock: number;
}

/**
 * Zone F — discovery. Discovery begins only after the core product
 * decision is understandable (spec 02 §F).
 *
 * Maximum one related-auctions rail + one Seen in Looks rail. Per spec
 * 02_AUCTION §9: no generic duplicate recommendation rails after that.
 */
export function AuctionDetailDiscovery({
  auction,
  relatedAuctions,
  secondClock,
}: Props) {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, fxRates, displayMode } = useCurrencyContext();

  const { data: recommendationsData } = useRecommendations(
    auction.listingId
  );
  const recommendationSections = React.useMemo(
    () => recommendationsData?.sections ?? [],
    [recommendationsData],
  );
  const seenInLooksSection = React.useMemo(
    () => recommendationSections.find((s) => s.key === 'seen_in_looks'),
    [recommendationSections],
  );

  const handlePressRecommendation = React.useCallback(
    (
      recItem: Listing,
      sectionKey?: string,
      position?: number,
      reasonCode?: string,
      personalised?: boolean,
    ) => {
      openProductDetail(navigation, {
        referenceKind: 'listing',
        canonicalId: recItem.id,
        sourceSurface: 'AuctionDetail',
        sectionKey,
        position,
        reasonCode,
        personalised,
      });
    },
    [navigation],
  );
  const handlePressLook = React.useCallback((lookItem: RecommendationLook) => {
    navigation.navigate('LookDetail', { lookId: lookItem.id });
  }, [navigation]);

  const handlePressRelatedAuction = React.useCallback((id: string) => {
    navigation.push('AuctionDetail', { auctionId: id });
  }, [navigation]);

  return (
    <>
      {relatedAuctions.length > 0 && (
        <CommerceRelatedRail
          label={auction.category ? `More ${auction.category.toLowerCase()} auctions` : 'More auctions'}
          items={relatedAuctions.map((rel) => {
            const relTiming = resolveAuctionTiming(rel, secondClock);
            const relPrice = rel.bidCount > 0 ? rel.currentBidGbp : rel.startingBidGbp;
            const relStateLabel = relTiming.effectiveState === 'live' ? 'LIVE'
              : relTiming.effectiveState === 'upcoming' ? 'SOON'
              : relTiming.effectiveState === 'cancelled' ? 'CANCELLED'
              : relTiming.effectiveState === 'settled' ? 'SETTLED'
              : 'ENDED';
            const relTimeLabel = relTiming.effectiveState === 'live'
              ? `${Math.floor(relTiming.msToEnd / 60000)}m left`
              : relTiming.effectiveState === 'upcoming'
              ? `in ${Math.floor(relTiming.msToStart / 60000)}m`
              : '';
            return {
              id: rel.id,
              title: rel.title,
              imageUrl: rel.imageUrl,
              priceText: formatFromFiat(relPrice, 'GBP'),
              sizeText: displayMode !== 'fiat' ? formatIzeAmount(toIze(relPrice, currencyCode, fxRates), 2) : undefined,
              badgeText: relStateLabel,
              mode: 'auction' as const,
              stateText: relStateLabel,
              countdownText: relTimeLabel || undefined,
            };
          })}
          onPressItem={handlePressRelatedAuction}
        />
      )}

      {seenInLooksSection && seenInLooksSection.items.length > 0 && (
        <View style={styles.recommendationSection}>
          <RecommendationRail
            section={seenInLooksSection}
            listingId={auction.listingId}
            onPressItem={(recItem, sectionKey, position, reasonCode, personalised) => {
              if (isRecommendationLook(recItem)) {
                handlePressLook(recItem);
              } else {
                handlePressRecommendation(recItem as Listing, sectionKey, position, reasonCode, personalised);
              }
            }}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  recommendationSection: {
    marginTop: Space.md,
  },
});
