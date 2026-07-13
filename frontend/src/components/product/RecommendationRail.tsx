import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  AccessibilityInfo,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import type { RecommendationSection } from '../../platform/product';
import { isRecommendationLook } from '../../platform/product';
import { ProductAnalytics } from '../../platform/product';
import { Listing } from '../../data/mockData';
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
  onPress: (item: Listing) => void;
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
  showAccent,
}: RailCardProps) {
  const { formatFromFiat } = useFormattedPrice();
  const formattedPrice = formatFromFiat(item.price, 'GBP');
  const imageUri = item.images?.[0];

  const handlePress = () => {
    ProductAnalytics.recommendationClick(listingId, sectionKey, index, reasonCode, personalised);
    onPress(item);
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
            containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.md }}
            contentFit="cover"
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
  onPressItem: (item: Listing) => void;
  onSeeAll?: () => void;
}

export function RecommendationRail({
  section,
  listingId,
  onPressItem,
  onSeeAll,
}: RecommendationRailProps) {
  const { width: screenWidth } = useWindowDimensions();

  if (section.items.length === 0) return null;

  const listingItems = section.items.filter((item): item is Listing => !isRecommendationLook(item));
  if (listingItems.length === 0) return null;

  const isComplementary = section.key === 'complete_the_look';
  const isPersonalised = section.personalised;
  const cardWidth = isComplementary
    ? (screenWidth - Space.md * 2 - Space.sm * 2) / 2.1
    : (screenWidth - Space.md * 2 - Space.sm * 2) / 2.5;
  const cardHeight = isComplementary ? 200 : 175;
  const showAccent = isPersonalised;

  return (
    <Reanimated.View
      entering={FadeInDown.duration(300).springify().damping(18)}
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
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </View>
          </Pressable>
        ) : null}
      </View>

      {section.reason ? (
        <View style={styles.reasonRow}>
          <Ionicons
            name={section.personalised ? 'sparkles' : 'pricetag'}
            size={12}
            color={Colors.textMuted}
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
        renderItem={({ item, index }) => (
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
        )}
        ItemSeparatorComponent={() => <View style={{ width: Space.sm }} />}
      />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    marginBottom: Space.xs,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAll: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  reasonText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  listContent: {
    paddingHorizontal: Space.md,
  },
  card: {
    width: 140,
  },
  cardAccent: {
    borderWidth: 1.5,
    borderColor: Colors.brand,
    borderRadius: Radius.md + 2,
    padding: 2,
  },
  cardImageWrap: {
    width: 140,
    height: 175,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surfaceAlt,
  },
  cardSoldBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: Colors.success,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  cardSoldText: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
    color: Colors.background,
  },
  cardBrand: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    marginTop: 6,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  cardPrice: {
    fontSize: 15,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
});
