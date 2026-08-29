import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, AspectRatio, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { RecommendationSection, RecommendationLook } from '../../platform/product';
import { isRecommendationLook } from '../../platform/product';
import { ProductAnalytics } from '../../platform/product';
import type { Listing } from '../../domain';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';

interface RailCardProps {
  item: Listing;
  index: number;
  sectionKey: string;
  reasonCode?: string;
  personalised?: boolean;
  listingId: string;
  onPress: (
    item: Listing,
    sectionKey: string,
    position: number,
    reasonCode?: string,
    personalised?: boolean,
  ) => void;
  cardWidth: number;
  cardHeight: number;
  showAccent: boolean;
}

function RailCard({
  item,
  index,
  sectionKey,
  reasonCode,
  personalised,
  listingId,
  onPress,
  cardWidth,
  cardHeight,
  showAccent }: RailCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat, currencyCode } = useFormattedPrice();
  const formattedPrice = formatFromFiat(item.price, currencyCode);
  const imageUri = item.images?.[0];

  const handlePress = () => {
    ProductAnalytics.recommendationClick(listingId, sectionKey, index, reasonCode, personalised);
    onPress(item, sectionKey, index, reasonCode, personalised);
  };

  return (
    <AnimatedPressable
      style={[styles.card, { width: cardWidth }, showAccent && styles.cardAccent]}
      onPress={handlePress}
      {...PressPresets.card}
      accessibilityLabel={`${item.title}, ${formattedPrice}`}
      accessibilityRole="button"
      onLayout={() => {
        ProductAnalytics.recommendationImpression(listingId, sectionKey, index, reasonCode, personalised);
      }}
    >
      <View style={[styles.cardImageWrap, { width: cardWidth, height: cardHeight }]}>
        {imageUri ? (
          <CachedImage
            uri={imageUri}
            style={styles.cardImage}
            containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.lg }}
            contentFit="cover"
            downscaleWidth={Math.round(cardWidth)}
          />
        ) : (
          <View style={styles.cardImageFallback} />
        )}
        {item.isSold && (
          <View style={styles.cardSoldBadge}>
            <Text style={styles.cardSoldText}>SOLD</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardBrand} numberOfLines={1}>
        {item.brand}
      </Text>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.cardPrice}>{formattedPrice}</Text>
    </AnimatedPressable>
  );
}

export interface RecommendationRailProps {
  section: RecommendationSection;
  listingId: string;
  onPressItem: (
    item: Listing,
    sectionKey: string,
    position: number,
    reasonCode?: string,
    personalised?: boolean,
  ) => void;
  onSeeAll?: () => void;
}

export function RecommendationRail({
  section,
  listingId,
  onPressItem,
  onSeeAll }: RecommendationRailProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();

  const listingItems = section.items.filter((item): item is Listing => !isRecommendationLook(item));

  const isComplementary = section.key === 'complete_the_look';
  const isPersonalised = section.personalised;
  // Portrait 3:4 card geometry (2026 Poshmark/Depop standard).
  // Card width targets 160–180px so taller portrait cards still show 2+ media
  // objects in the first viewport. Height is derived from width via the 3:4
  // ratio so the frame always matches the image crop.
  const cardWidth = isComplementary
    ? (screenWidth - Space.md * 2 - Space.sm * 2) / 2.0
    : (screenWidth - Space.md * 2 - Space.sm * 2) / 2.15;
  const cardHeight = Math.round(cardWidth / AspectRatio.portrait);
  const showAccent = isPersonalised;

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible rail cards on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderItem = useCallback(
    ({ item, index }: { item: Listing | RecommendationLook; index: number }) => (
      <RailCard
        item={item as Listing}
        index={index}
        sectionKey={section.key}
        reasonCode={section.reason}
        personalised={section.personalised}
        listingId={listingId}
        onPress={onPressItem}
        cardWidth={cardWidth}
        cardHeight={cardHeight}
        showAccent={showAccent}
      />
    ),
    [section.key, section.reason, section.personalised, listingId, onPressItem, cardWidth, cardHeight, showAccent],
  );

  if (section.items.length === 0 || listingItems.length === 0) return null;

  return (
    <View
      style={styles.container}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title} numberOfLines={1}>{section.title}</Text>
          {section.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {section.subtitle}
            </Text>
          ) : null}
        </View>
        {onSeeAll && section.items.length > 2 ? (
          <Pressable
            onPress={() => {
              ProductAnalytics.recommendationSectionSeeAll(listingId, section.key);
              onSeeAll();
            }}
            hitSlop={8}
            accessibilityLabel={`See all in ${section.title}`}
            accessibilityRole="button"
          >
            <View style={styles.seeAllRow}>
              <Text style={styles.seeAll}>See all</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </Pressable>
        ) : null}
      </View>

      {section.reason ? (
        <View style={styles.reasonRow}>
          <Ionicons
            name={section.personalised ? 'person-outline' : 'pricetag'}
            size={12}
            color={colors.textMuted}
          />
          <Text style={styles.reasonText}>{section.reason}</Text>
        </View>
      ) : null}

      <FlashList
        data={listingItems}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ width: Space.sm }} />}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginTop: Space.lg },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      marginBottom: Space.xs },
    headerLeft: {
      flex: 1,
      minWidth: 0 },
    title: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      color: colors.textPrimary },
    subtitle: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginTop: Space.xs },
    seeAllRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    seeAll: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    reasonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      marginBottom: Space.sm },
    reasonText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    listContent: {
      paddingHorizontal: Space.md },
    card: {
      width: 160 },
    cardAccent: {
      borderWidth: Stroke.standard,
      borderColor: colors.brand,
      borderRadius: Radius.xl,
      padding: 2 },
    cardImageWrap: {
      width: 160,
      height: 213,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt },
    cardImage: {
      width: '100%',
      height: '100%' },
    cardImageFallback: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.surfaceAlt },
    cardSoldBadge: {
      position: 'absolute',
      bottom: Space.xs,
      left: Space.xs,
      backgroundColor: colors.success,
      paddingHorizontal: Space.xs,
      paddingVertical: 2,
      borderRadius: Radius.sm },
    cardSoldText: {
      fontSize: 10,
      fontFamily: Typography.family.bold,
      color: colors.background },
    cardBrand: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginTop: Space.xs },
    cardTitle: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textPrimary,
      marginTop: Space.xs },
    cardPrice: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      marginTop: Space.xs } });
}
