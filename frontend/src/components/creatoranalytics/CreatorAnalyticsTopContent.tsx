import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import type {
  ContentRankingItem,
  ContentRankingResponse } from '../../services/creatorAnalyticsApi';
import {
  createContentRowStyles,
  createCreatorAnalyticsStyles } from './creatorAnalyticsStyles';
import { formatCount, formatRate } from './creatorAnalyticsFormat';

// ── Top content — real thumbnails as colour ─────────────────────────
export function CreatorAnalyticsTopContent({
  ranking,
  onPressItem }: {
  ranking: ContentRankingResponse | null;
  onPressItem: (item: ContentRankingItem) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createCreatorAnalyticsStyles(colors), [colors]);
  if (!ranking || ranking.items.length === 0) return null;
  return (
    <View style={styles.contentSection}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        Top content
      </Text>
      {ranking.items.map((item, i) => (
        <AnimatedPressable
          key={`${item.contentType}:${item.contentId}`}
          onPress={() => onPressItem(item)}
          style={styles.contentRowPress}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.title}`}
        >
          <ContentRankingRow
            item={item}
            rank={i + 1}
            colors={colors}
            isLast={i === ranking.items.length - 1}
          />
        </AnimatedPressable>
      ))}
    </View>
  );
}

// ── Content ranking row ────────────────────────────────────────────────
function ContentRankingRow({
  item,
  rank,
  colors,
  isLast }: {
  item: ContentRankingResponse['items'][number];
  rank: number;
  colors: ThemeColors;
  isLast: boolean;
}) {
  const styles = useMemo(() => createContentRowStyles(colors), [colors]);
  return (
    <View style={[styles.row, !isLast && { borderBottomColor: colors.border }]}>
      <Text style={[styles.rank, { color: colors.textMuted }]}>
        {rank}
      </Text>
      <View style={styles.thumbWrap}>
        {item.thumbnailUrl ? (
          <CachedImage
            uri={item.thumbnailUrl}
            style={styles.thumb}
            contentFit="cover"
            transition={200}
            priority="normal"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons
              name={item.contentType === 'look' ? 'shirt-outline' : 'image-outline'}
              size={18}
              color={colors.textMuted}
            />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            {formatCount(item.views)} views
          </Text>
          <Text style={[styles.metaDot, { color: colors.border }]}>·</Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            {formatRate(item.engagementRate)} engagement
          </Text>
        </View>
      </View>
    </View>
  );
}
