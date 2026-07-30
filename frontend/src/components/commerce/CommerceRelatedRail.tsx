import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
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
  const { colors } = useAppTheme();

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
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
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
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
                <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="image-outline" size={20} color={colors.textMuted} />
                </View>
              )}

              {item.badgeText ? (
                <View style={[styles.badge, item.badgeColor ? { backgroundColor: item.badgeColor } : null]}>
                  <Text style={styles.badgeText}>{item.badgeText}</Text>
                </View>
              ) : null}

              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {item.title}
                </Text>

                <Text style={[styles.cardPrice, { color: colors.textPrimary }]}>{item.priceText}</Text>

                {item.izeText ? (
                  <Text style={[styles.cardIze, { color: colors.textMuted }]}>{item.izeText}</Text>
                ) : null}

                {mode === 'auction' ? (
                  <>
                    {item.stateText ? (
                      <Text style={[styles.cardMeta, styles.cardMetaStrong, { color: colors.textSecondary }]}>
                        {item.stateText}
                      </Text>
                    ) : null}
                    {item.countdownText ? (
                      <Text style={[styles.cardMeta, { color: colors.danger }]}>{item.countdownText}</Text>
                    ) : null}
                  </>
                ) : mode === 'co_own' ? (
                  <>
                    {item.availableUnits != null && item.totalUnits != null ? (
                      <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                        {item.availableUnits}/{item.totalUnits}u available
                      </Text>
                    ) : null}
                    {item.marketMoveText ? (
                      <Text style={[styles.cardMeta, styles.cardMetaStrong, { color: colors.textSecondary }]}>
                        {item.marketMoveText}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  item.sizeText || item.conditionText ? (
                    <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                      {[item.sizeText, item.conditionText].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null
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
    marginTop: Space.xl,
  },
  label: {
    paddingHorizontal: Space.md,
    marginBottom: Space.md,
    fontSize: 17,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    gap: 12,
  },
  card: {
    width: 148,
  },
  cardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  cardImage: {
    width: '100%',
    height: 168,
  },
  cardImageContainer: {
    width: '100%',
    height: 168,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 168,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    maxWidth: 126,
    backgroundColor: 'rgba(0,0,0,0.68)',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: '#fff',
    letterSpacing: 0.3,
  },
  cardBody: {
    paddingTop: Space.sm,
  },
  cardTitle: {
    minHeight: 36,
    marginBottom: Space.xs,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Typography.family.medium,
  },
  cardPrice: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: Typography.family.semibold,
  },
  cardIze: {
    marginTop: 1,
    fontSize: 11,
    fontFamily: Typography.family.regular,
  },
  cardMeta: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: Typography.family.regular,
  },
  cardMetaStrong: {
    fontFamily: Typography.family.semibold,
  },
});
