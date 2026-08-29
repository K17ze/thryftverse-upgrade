import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useAppTheme } from '../../theme/ThemeContext';
import { Typography, Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface FeaturedBoard {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  images: string[];
  isVerified?: boolean;
  onPress?: () => void;
}

interface Props {
  board: FeaturedBoard;
}

export function FeaturedBoardCard({ board }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const imgs = board.images.slice(0, 3);
  while (imgs.length < 3) {
    imgs.push('');
  }

  return (
    <AnimatedPressable
      style={styles.card}
      onPress={board.onPress}
      activeOpacity={0.92}
      accessibilityLabel={`${board.title} board`}
      accessibilityHint="Opens board details"
    >
      {/* Collage grid */}
      <View style={styles.collage}>
        <CachedImage
          uri={imgs[0]}
          style={styles.mainImage}
          containerStyle={{ borderTopLeftRadius: Radius.xl, borderBottomLeftRadius: Radius.xl }}
          contentFit="cover"
        />
        <View style={styles.sideColumn}>
          <CachedImage
            uri={imgs[1]}
            style={styles.sideImage}
            containerStyle={{ borderTopRightRadius: Radius.xl }}
            contentFit="cover"
          />
          <CachedImage
            uri={imgs[2]}
            style={styles.sideImage}
            containerStyle={{ borderBottomRightRadius: Radius.xl }}
            contentFit="cover"
          />
        </View>
      </View>

      {/* Text info */}
      <Text style={styles.title} numberOfLines={1}>{board.title}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.subtitle}>{board.subtitle}</Text>
        {board.isVerified && (
          <Ionicons name="checkmark-circle" size={14} color={colors.brand} style={{ marginLeft: Space.xs }} />
        )}
      </View>
      <Text style={styles.meta}>{board.meta}</Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  card: {
    width: 260,
    marginRight: Space.smMd },
  collage: {
    flexDirection: 'row',
    height: 150,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    gap: 3,
    marginBottom: Space.smMd },
  mainImage: {
    flex: 3,
    height: '100%' },
  sideColumn: {
    flex: 2,
    gap: 3 },
  sideImage: {
    flex: 1,
    width: '100%' },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size,
    color: colors.textPrimary,
    marginBottom: 3,
    letterSpacing: -0.2 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.xxs },
  subtitle: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: colors.textSecondary },
  meta: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted } });