import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Space, Control } from '../../../theme/designTokens';
import { CachedImage } from '../../CachedImage';
import { AppIcon } from '../../common/AppIcon';
import { IconSize } from '../../../theme/iconTokens';
import { openProductDetail } from '../../../platform/product/openProductDetail';
import { adjustListingPrice } from '../../../services/commerceApi';
import { haptics } from '../../../utils/haptics';
import type { SellerAnalyticsModel } from './useSellerAnalytics';

export function ListingAnalyticsDetail({ model }: { model: SellerAnalyticsModel }) {
  const {
    styles,
    colors,
    listingAnalytics,
    currentListingItem,
    formatFromFiat,
    navigation,
    selectedListingId,
    listingError,
    isListingLoading,
    loadListingAnalytics,
    currentUser,
  } = model;

  const [isAdjusting, setIsAdjusting] = React.useState(false);

  const handleQuickReprice = async (targetPrice: number) => {
    if (!currentUser?.id || !selectedListingId || isAdjusting) return;
    haptics.selection();
    setIsAdjusting(true);
    try {
      await adjustListingPrice(currentUser.id, selectedListingId, targetPrice);
      await loadListingAnalytics(selectedListingId);
    } catch {
      // safe fallback
    } finally {
      setIsAdjusting(false);
    }
  };

  return (
    <>
      <View style={styles.productAnalyticsContainer}>
        {/* Product Identity Hero */}
        <View style={styles.productHero}>
          <View style={styles.productHeroMedia}>
            {listingAnalytics?.listing.imageUrl ?? currentListingItem?.imageUrl ?? currentListingItem?.images?.[0] ? (
              <CachedImage
                uri={listingAnalytics?.listing.imageUrl ?? currentListingItem?.imageUrl ?? currentListingItem?.images?.[0] ?? ''}
                style={styles.productHeroImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.productHeroImage, { backgroundColor: colors.surfaceAlt }]} />
            )}
          </View>

          <View style={styles.productHeroDetails}>
            <View style={styles.productHeroStatusRow}>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor:
                      (listingAnalytics?.listing.status ?? currentListingItem?.status) === 'sold'
                        ? colors.successSubtle
                        : colors.surfaceAlt,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    {
                      color:
                        (listingAnalytics?.listing.status ?? currentListingItem?.status) === 'sold'
                          ? colors.success
                          : colors.brand,
                    },
                  ]}
                >
                  {(listingAnalytics?.listing.status ?? currentListingItem?.status ?? 'Unknown')}
                </Text>
              </View>
              {listingAnalytics?.timeOnMarketDays != null ? (
                (() => {
                  const dom = listingAnalytics.timeOnMarketDays;
                  const isSold = Boolean(listingAnalytics.listing.soldAt);
                  if (isSold) {
                    return (
                      <Text style={[styles.marketDaysText, { color: colors.textMuted }]}>
                        Sold in {dom}d
                      </Text>
                    );
                  }
                  const badgeBg = dom < 7 ? colors.successSubtle : dom <= 14 ? colors.surfaceAlt : colors.dangerSubtle;
                  const badgeColor = dom < 7 ? colors.success : dom <= 14 ? colors.textPrimary : colors.danger;
                  const badgeLabel = dom < 7 ? `${dom}d · High velocity` : dom <= 14 ? `${dom}d on market` : `${dom}d · Stale inventory`;
                  return (
                    <View style={[styles.velocityTag, { backgroundColor: badgeBg }]}>
                      <Text style={[styles.velocityTagText, { color: badgeColor }]}>{badgeLabel}</Text>
                    </View>
                  );
                })()
              ) : null}
            </View>

                <Text style={[styles.productHeroTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {listingAnalytics?.listing.title ?? currentListingItem?.title ?? 'Untitled'}
                </Text>

                <Text style={[styles.productHeroPrice, { color: colors.textPrimary }]}>
                  {formatFromFiat(
                    listingAnalytics?.listing.priceGbpMinor
                      ? listingAnalytics.listing.priceGbpMinor / 100
                      : currentListingItem?.priceGbp ?? 0,
                    'GBP',
                    { displayMode: 'fiat' }
                  )}
                </Text>

                {listingAnalytics?.listing.brand || listingAnalytics?.listing.category ? (
                  <Text style={[styles.productHeroMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[listingAnalytics.listing.brand, listingAnalytics.listing.category, listingAnalytics.listing.condition]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Actions: Edit & Storefront */}
            <View style={styles.productActionRow}>
              <Pressable
                style={({ pressed }) => [styles.productActionLink, { minHeight: Control.hit }, pressed && { opacity: 0.6 }]}
                onPress={() => selectedListingId && navigation.navigate('EditListing', { itemId: selectedListingId })}
                accessibilityRole="button"
                accessibilityLabel="Edit this listing"
                accessibilityHint="Opens the listing editor to update price or details"
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              >
                <AppIcon concept="edit" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.productActionText, { color: colors.brand }]}>Edit Listing</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.productActionLink, { minHeight: Control.hit }, pressed && { opacity: 0.6 }]}
                onPress={() =>
                  selectedListingId &&
                  openProductDetail(navigation, {
                    referenceKind: 'listing',
                    canonicalId: selectedListingId,
                    sourceSurface: 'SellerAnalytics',
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="View listing detail"
                accessibilityHint="Opens the listing detail page"
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              >
                <AppIcon concept="eye" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.productActionText, { color: colors.brand }]}>View</Text>
              </Pressable>
            </View>

            {listingError ? (
              <View style={styles.listingErrorState}>
                <Text style={[styles.listingErrorText, { color: colors.danger }]}>
                  Couldn't refresh listing engagement metrics
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.listingErrorRetry, { borderColor: colors.brand, minHeight: Control.hit }, pressed && { opacity: 0.6 }]}
                  onPress={() => {
                    if (selectedListingId) void loadListingAnalytics(selectedListingId);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading Listing Analytics"
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={[styles.listingErrorRetryText, { color: colors.brand }]}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {/* 5-Stat Resale Intent Cockpit (Depop / Grailed / StockX Pro Model) */}
            {isListingLoading ? (
              <View style={styles.productStatsStrip}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <View key={i} style={styles.productStatItem}>
                    <View style={[styles.skeletonBlock, { width: 36, height: 12 }]} />
                    <View style={{ height: 4 }} />
                    <View style={[styles.skeletonBlock, { width: 44, height: 20 }]} />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.productStatsStrip}>
                <View style={styles.productStatItem}>
                  <Text style={[styles.productStatLabel, { color: colors.textMuted }]}>Views</Text>
                  <Text style={[styles.productStatValue, { color: colors.textPrimary }]}>
                    {listingAnalytics?.views ?? 0}
                  </Text>
                </View>
                <View style={[styles.productStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.productStatItem}>
                  <Text style={[styles.productStatLabel, { color: colors.textMuted }]}>Saves</Text>
                  <Text style={[styles.productStatValue, { color: colors.textPrimary }]}>
                    {listingAnalytics?.saves ?? 0}
                  </Text>
                </View>
                <View style={[styles.productStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.productStatItem}>
                  <Text style={[styles.productStatLabel, { color: colors.textMuted }]}>Save rate</Text>
                  <Text
                    style={[
                      styles.productStatValue,
                      { color: (listingAnalytics?.saveRate ?? 0) >= 5 ? colors.brand : colors.textPrimary },
                    ]}
                  >
                    {listingAnalytics?.saveRate != null ? `${listingAnalytics.saveRate.toFixed(1)}%` : '—'}
                  </Text>
                </View>
                <View style={[styles.productStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.productStatItem}>
                  <Text style={[styles.productStatLabel, { color: colors.textMuted }]}>Offers</Text>
                  <Text style={[styles.productStatValue, { color: colors.textPrimary }]}>
                    {listingAnalytics?.offers ?? 0}
                  </Text>
                </View>
                <View style={[styles.productStatDivider, { backgroundColor: colors.border }]} />
                <View style={styles.productStatItem}>
                  <Text style={[styles.productStatLabel, { color: colors.textMuted }]}>Conversion</Text>
                  <Text style={[styles.productStatValue, { color: colors.textPrimary }]}>
                    {listingAnalytics?.conversionRate != null ? `${listingAnalytics.conversionRate.toFixed(1)}%` : '—'}
                  </Text>
                </View>
              </View>
            )}

            {/* Purchase Intent Diagnostic (Depop / Grailed circular model) */}
            {listingAnalytics?.intentSignal === 'high_intent_price_friction' ? (
              <View style={[styles.intentCallout, { backgroundColor: colors.brandSubtle, borderColor: colors.brand }]}>
                <AppIcon concept="tag" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.intentCalloutText, { color: colors.textPrimary }]}>
                  High buyer intent detected ({listingAnalytics.saveRate}% save rate). Buyers are saving this item but hesitating on price. A 5-10% price reduction will alert all likers and accelerate conversion.
                </Text>
              </View>
            ) : listingAnalytics?.intentSignal === 'low_affinity_photo_needed' ? (
              <View style={[styles.intentCallout, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <AppIcon concept="camera" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
                <Text style={[styles.intentCalloutText, { color: colors.textPrimary }]}>
                  Healthy discovery clicks with low save rate. Consider refreshing cover photo or adding garment measurements to lift buyer intent.
                </Text>
              </View>
            ) : null}

            {/* Market Price Benchmark Spectrum */}
            {listingAnalytics?.comparables && listingAnalytics.comparables.sampleSize > 0 ? (
              (() => {
                const comps = listingAnalytics.comparables;
                const askingPrice = listingAnalytics.listing.priceGbpMinor
                  ? listingAnalytics.listing.priceGbpMinor / 100
                  : currentListingItem?.priceGbp ?? 0;
                const minP = comps.minPrice ?? askingPrice;
                const maxP = comps.maxPrice ?? askingPrice;
                const medP = comps.medianPrice ?? askingPrice;
                const span = Math.max(maxP - minP, 1);
                const posPct = Math.min(94, Math.max(6, Math.round(((askingPrice - minP) / span) * 100)));
                const medPct = Math.min(94, Math.max(6, Math.round(((medP - minP) / span) * 100)));

                const isBelowMedian = askingPrice < medP * 0.96;
                const isAboveMedian = askingPrice > medP * 1.04;
                const posBadge = isBelowMedian
                  ? 'Below median'
                  : isAboveMedian
                  ? 'Above median'
                  : 'At median';

                return (
                  <View style={styles.comparablesSection}>
                    <View style={styles.comparablesHeader}>
                      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 2 }]}>
                        Market price spectrum
                      </Text>
                      <View style={[styles.spectrumPill, { backgroundColor: isBelowMedian ? colors.successSubtle : colors.surfaceAlt }]}>
                        <Text
                          style={[
                            styles.spectrumPillText,
                            { color: isBelowMedian ? colors.success : colors.textPrimary },
                          ]}
                        >
                          {posBadge}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.spectrumSubtitle, { color: colors.textMuted }]}>
                      Benchmarked against {comps.sampleSize} verified sales in{' '}
                      {listingAnalytics.listing.category ?? 'this category'}
                    </Text>

                    {/* Horizontal Spectrum Bar with Pointer */}
                    <View style={styles.spectrumBarContainer}>
                      <View style={[styles.spectrumTrack, { backgroundColor: colors.surfaceAlt }]}>
                        <View
                          style={[
                            styles.spectrumMedianMarker,
                            { left: `${medPct}%`, backgroundColor: colors.textMuted },
                          ]}
                        />
                      </View>

                      {/* Current Asking Price Pin */}
                      <View style={[styles.spectrumPinContainer, { left: `${posPct}%` }]}>
                        <View style={[styles.spectrumPinBadge, { backgroundColor: colors.brand }]}>
                          <Text style={[styles.spectrumPinText, { color: colors.background }]}>
                            {formatFromFiat(askingPrice, undefined, { displayMode: 'fiat' })}
                          </Text>
                        </View>
                        <View style={[styles.spectrumPinPoint, { borderTopColor: colors.brand }]} />
                      </View>
                    </View>

                    {/* Value Metrics Row */}
                    <View style={styles.comparablesValuesRow}>
                      <View style={styles.compValueItem}>
                        <Text style={[styles.compValueLabel, { color: colors.textMuted }]}>Min sold</Text>
                        <Text style={[styles.compValueNumber, { color: colors.textPrimary }]}>
                          {formatFromFiat(minP, undefined, { displayMode: 'fiat' })}
                        </Text>
                      </View>
                      <View style={[styles.compValueItem, { alignItems: 'center' }]}>
                        <Text style={[styles.compValueLabel, { color: colors.brand }]}>Market median</Text>
                        <Text style={[styles.compValueNumber, { color: colors.brand }]}>
                          {formatFromFiat(medP, undefined, { displayMode: 'fiat' })}
                        </Text>
                      </View>
                      <View style={[styles.compValueItem, { alignItems: 'flex-end' }]}>
                        <Text style={[styles.compValueLabel, { color: colors.textMuted }]}>Max sold</Text>
                        <Text style={[styles.compValueNumber, { color: colors.textPrimary }]}>
                          {formatFromFiat(maxP, undefined, { displayMode: 'fiat' })}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()
            ) : null}

            {/* 1-Tap Price Velocity & Reprice (StockX Pro 3-Tier Guidance) */}
            {listingAnalytics && (listingAnalytics.listing.status ?? currentListingItem?.status) === 'active' ? (
              (() => {
                const askingPrice = listingAnalytics.listing.priceGbpMinor
                  ? listingAnalytics.listing.priceGbpMinor / 100
                  : currentListingItem?.priceGbp ?? 0;
                const p5 = Math.round(askingPrice * 0.95 * 100) / 100;
                const p10 = Math.round(askingPrice * 0.90 * 100) / 100;
                const medP = listingAnalytics.comparables?.medianPrice;
                const canMatchMedian = medP != null && medP > 0 && askingPrice > medP;

                return (
                  <View style={styles.quickRepriceSection}>
                    <Text style={[styles.quickRepriceTitle, { color: colors.textPrimary }]}>
                      StockX Pro Pricing Guidance · 1-Tap Velocity Levers
                    </Text>
                    <View style={styles.quickRepriceRow}>
                      <Pressable
                        style={({ pressed }) => [styles.quickRepriceButton, isAdjusting && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
                        onPress={() => void handleQuickReprice(p5)}
                        disabled={isAdjusting}
                        accessibilityRole="button"
                        accessibilityLabel={`Sell faster at 5% discount, price ${formatFromFiat(p5, undefined, { displayMode: 'fiat' })}`}
                      >
                        <Text style={[styles.quickRepriceStrategy, { color: colors.textMuted }]}>Sell Faster</Text>
                        <Text style={[styles.quickRepriceButtonText, { color: colors.brand }]}>-5%</Text>
                        <Text style={[styles.quickRepriceSubtext, { color: colors.textMuted }]}>
                          {formatFromFiat(p5, undefined, { displayMode: 'fiat' })}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={({ pressed }) => [styles.quickRepriceButton, isAdjusting && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
                        onPress={() => void handleQuickReprice(p10)}
                        disabled={isAdjusting}
                        accessibilityRole="button"
                        accessibilityLabel={`Aggressive velocity at 10% discount, price ${formatFromFiat(p10, undefined, { displayMode: 'fiat' })}`}
                      >
                        <Text style={[styles.quickRepriceStrategy, { color: colors.textMuted }]}>Aggressive</Text>
                        <Text style={[styles.quickRepriceButtonText, { color: colors.brand }]}>-10%</Text>
                        <Text style={[styles.quickRepriceSubtext, { color: colors.textMuted }]}>
                          {formatFromFiat(p10, undefined, { displayMode: 'fiat' })}
                        </Text>
                      </Pressable>

                      {canMatchMedian ? (
                        <Pressable
                          style={({ pressed }) => [styles.quickRepriceButton, isAdjusting && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
                          onPress={() => void handleQuickReprice(medP)}
                          disabled={isAdjusting}
                          accessibilityRole="button"
                          accessibilityLabel={`Match market median price of ${formatFromFiat(medP, undefined, { displayMode: 'fiat' })}`}
                        >
                          <Text style={[styles.quickRepriceStrategy, { color: colors.success }]}>Sell Now</Text>
                          <Text style={[styles.quickRepriceButtonText, { color: colors.success }]}>Match</Text>
                          <Text style={[styles.quickRepriceSubtext, { color: colors.textMuted }]}>
                            {formatFromFiat(medP, undefined, { displayMode: 'fiat' })}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })()
            ) : null}

            {/* Price History Ledger */}
            {listingAnalytics?.priceHistory && listingAnalytics.priceHistory.length > 0 ? (
              <View style={styles.priceHistorySection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Price adjustments</Text>
                <View style={styles.priceHistoryList}>
                  {listingAnalytics.priceHistory.map((event, idx) => {
                    const isReduction = event.newPrice < event.previousPrice;
                    return (
                      <View key={idx} style={styles.priceHistoryRow}>
                        <AppIcon
                          name={isReduction ? 'trending-down' : 'trending-up'}
                          size={IconSize.sm}
                          color={isReduction ? 'success' : 'textMuted'}
                          opticalCenter
                          accessible={false}
                        />
                        <Text style={[styles.priceHistoryText, { color: colors.textPrimary }]}>
                          {formatFromFiat(event.previousPrice, 'GBP', { displayMode: 'fiat' })} → {formatFromFiat(event.newPrice, 'GBP', { displayMode: 'fiat' })}
                        </Text>
                        <Text style={[styles.priceHistoryDate, { color: colors.textMuted }]}>
                          {new Date(event.changedAt).toLocaleDateString()}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
 </>);
}
