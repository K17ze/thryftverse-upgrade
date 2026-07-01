import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

export type RelatedItemMode = 'standard' | 'auction' | 'co_own';

export interface RelatedItem {
  id: string;
  title: string;
  imageUrl?: string | null;
  priceText: string;
  izeText?: string;
  badgeText?: string;
  badgeColor?: string;
  metaText?: string;
  mode?: RelatedItemMode;
  countdownText?: string;
  stateText?: string;
  availableUnits?: number;
  totalUnits?: number;
  marketMoveText?: string;
  conditionText?: string;
  sizeText?: string;
}

export interface CommerceRelatedRailProps {
  label: string;
  items: RelatedItem[];
  onPressItem: (id: string) => void;
}

export function CommerceRelatedRail({
  label,
  items,
  onPressItem,
}: CommerceRelatedRailProps) {
  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item) => {
          const mode = item.mode ?? 'standard';
          return (
            <Pressable
              key={item.id}
              style={styles.card}
              onPress={() => onPressItem(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${item.priceText}${item.badgeText ? `, ${item.badgeText}` : ''}`}
            >
              {item.imageUrl ? (
                <CachedImage
                  uri={item.imageUrl}
                  style={styles.cardImage}
                  containerStyle={styles.cardImageContainer}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.cardImagePlaceholder}>
                  <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
                </View>
              )}
              {item.badgeText && (
                <View style={[styles.badge, item.badgeColor && { backgroundColor: item.badgeColor }]}>
                  <Text style={styles.badgeText}>{item.badgeText}</Text>
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                {mode === 'auction' ? (
                  <>
                    <Text style={styles.cardPrice}>{item.priceText}</Text>
                    {item.izeText && (
                      <Text style={styles.cardIze}>{item.izeText}</Text>
                    )}
                    {item.stateText && (
                      <Text style={[styles.cardMeta, styles.cardStateText]}>{item.stateText}</Text>
                    )}
                    {item.countdownText && (
                      <Text style={[styles.cardMeta, styles.cardCountdownText]}>{item.countdownText}</Text>
                    )}
                  </>
                ) : mode === 'co_own' ? (
                  <>
                    <Text style={styles.cardPrice}>{item.priceText}</Text>
                    {item.izeText && (
                      <Text style={styles.cardIze}>{item.izeText}</Text>
                    )}
                    {item.availableUnits != null && item.totalUnits != null && (
                      <Text style={styles.cardMeta}>
                        {item.availableUnits}/{item.totalUnits}u available
                      </Text>
                    )}
                    {item.marketMoveText && (
                      <Text style={[styles.cardMeta, styles.cardMarketMove]}>{item.marketMoveText}</Text>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={styles.cardPrice}>{item.priceText}</Text>
                    {item.izeText && (
                      <Text style={styles.cardIze}>{item.izeText}</Text>
                    )}
                    {(item.sizeText || item.conditionText) && (
                      <Text style={styles.cardMeta}>
                        {[item.sizeText, item.conditionText].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Space.lg,
  },
  label: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  card: {
    width: 140,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardImage: {
    width: '100%',
    height: 140,
  },
  cardImageContainer: {
    width: '100%',
    height: 140,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 140,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: '#fff',
    letterSpacing: 0.3,
  },
  cardBody: {
    padding: Space.sm,
  },
  cardTitle: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  cardPrice: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  cardIze: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 1,
  },
  cardMeta: {
    fontSize: 10,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  cardStateText: {
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  cardCountdownText: {
    color: Colors.danger,
  },
  cardMarketMove: {
    fontFamily: Typography.family.semibold,
  },
});
