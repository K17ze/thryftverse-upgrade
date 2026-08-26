import React, { memo, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import { haptics } from '../../utils/haptics';
import { Space, Radius, Typography, Type, Control } from '../../theme/designTokens';
import type { AuctionHomeItem } from '../../utils/auctionHomeLogic';
import { AuctionValueLockup } from './AuctionValueLockup';

// ════════════════════════════════════════════════════════════════
// UPCOMING ROW — scheduled programme row
// ════════════════════════════════════════════════════════════════
export const UpcomingRow = memo(function UpcomingRow({
  item,
  onPress,
  formatValueLockup,
}: {
  item: AuctionHomeItem;
  onPress: () => void;
  formatValueLockup: (amountGbp: number) => { izeText: string; localText: string | null };
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const valueLockup = formatValueLockup(item.startingBidGbp);
  const startDate = new Date(item.startsAt);
  const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = startDate.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const a11yLabel = `Starts ${dateStr} at ${timeStr}. ${item.title}. Starting at ${valueLockup.izeText}`;

  return (
    <Pressable
      style={styles.upcomingRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.upcomingImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.upcomingImage}
            containerStyle={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
        )}
      </View>
      <View style={styles.upcomingBody}>
        <Text style={styles.upcomingDate}>{dateStr} · {timeStr}</Text>
        {item.brand ? <Text style={styles.upcomingEyebrow} numberOfLines={1}>{item.brand}</Text> : null}
        <Text style={styles.upcomingTitle} numberOfLines={1}>{item.title}</Text>
        <AuctionValueLockup
          izeText={valueLockup.izeText}
          localText={valueLockup.localText}
          state="starting"
          scale="compact"
        />
      </View>
      <Pressable
        style={styles.upcomingNotify}
        onPress={() => { haptics.tap(); onPress(); }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="View auction"
      >
        <Ionicons name="chevron-forward" size={18} color={colors.brand} />
      </Pressable>
    </Pressable>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    upcomingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    upcomingImageWrap: {
      width: Space.xxl + Space.xxl + Space.xs,
      height: Space.xxl + Space.xxl + Space.xs,
      borderRadius: Radius.md,
      overflow: 'hidden',
    },
    upcomingImage: {
      width: Space.xxl + Space.xxl + Space.xs,
      height: Space.xxl + Space.xxl + Space.xs,
    },
    upcomingBody: {
      flex: 1,
      gap: Space.xs / 4,
    },
    upcomingDate: {
      fontSize: Type.label.size,
      lineHeight: Type.label.lineHeight,
      fontWeight: '600',
      letterSpacing: Type.label.letterSpacing,
      color: colors.textSecondary,
      fontFamily: Typography.family.semibold,
      marginBottom: Space.xs / 2,
      fontVariant: ['tabular-nums'],
    },
    upcomingEyebrow: {
      fontSize: Type.meta.size,
      color: colors.textMuted,
      fontFamily: Typography.family.medium,
      marginBottom: Space.xs / 4,
      letterSpacing: Type.caption.letterSpacing,
    },
    upcomingTitle: {
      fontSize: Type.bodyStrong.size,
      lineHeight: Type.bodyStrong.lineHeight,
      fontWeight: '600',
      color: colors.textPrimary,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.bodyStrong.letterSpacing,
    },
    upcomingNotify: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
