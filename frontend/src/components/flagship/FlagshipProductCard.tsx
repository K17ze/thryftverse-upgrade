import React from 'react';
import { View, StyleSheet, useWindowDimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control, AspectRatio, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { Motion } from '../../theme/motionTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { isVideoUri, getCategoryFocalPoint } from '../../utils/media';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const GAP = Space.sm;
const COLUMNS = 2;

interface FlagshipProductCardProps {
  imageUri: string;
  title: string;
  price: string;
  category?: string;
  onPress?: () => void;
  onToggleSave?: () => void;
  isSaved?: boolean;
  isWishlisted?: boolean;
  sellerName?: string;
  condition?: string;
  style?: object;
}

export function FlagshipProductCard({
  imageUri,
  title,
  price,
  category,
  onPress,
  onToggleSave,
  isSaved = false,
  isWishlisted = false,
  sellerName,
  condition,
  style }: FlagshipProductCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  const cardW = (screenWidth - Space.md * 2 - GAP) / COLUMNS;
  const cardH = cardW / AspectRatio.marketplace; // 4:5 ratio
  const hasVideo = isVideoUri(imageUri);
  const reducedMotion = useReducedMotion();
  const saved = isSaved || isWishlisted;
  const enter = reducedMotion ? undefined : FadeIn.duration(Motion.transitions.listItem.duration);

  const cardLabel = sellerName
    ? `${title}, ${price}, ${sellerName}`
    : `${title}, ${price}`;

  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.root, { width: cardW }, style]}
      accessibilityRole="button"
      accessibilityLabel={cardLabel}
      accessibilityHint="View item details"
    >
      <View style={[styles.imageWrap, { width: cardW, height: cardH }]}>
        <CachedImage
          uri={imageUri}
          style={{ width: cardW, height: cardH }}
          contentFit="cover"
          transition={Motion.transitions.mediaLoad.duration}
          priority="normal"
          focalPoint={getCategoryFocalPoint(category)}
          accessibilityRole="image"
          accessibilityLabel={title}
        />

        {/* Top-right save button — 44pt hit area, transparent by default */}
        {onToggleSave && (
          <Pressable
            onPress={() => {
              onToggleSave();
            }}
            style={styles.saveBtn}
            hitSlop={12}
            accessibilityLabel={saved ? 'Remove from saved' : 'Save item'}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityHint={saved ? 'Removes this item from your saved list' : 'Saves this item to your saved list'}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={IconGrammar.standard}
              color={saved ? colors.danger : colors.scrimTextPrimary}
            />
          </Pressable>
        )}

        {/* Video indicator — compact, only when media is video */}
        {hasVideo && (
          <View style={styles.videoBadge} accessibilityElementsHidden>
            <Ionicons name="videocam" size={IconGrammar.badge} color={colors.scrimTextPrimary} />
          </View>
        )}
      </View>

      {/* Metadata below image — flat, no card shell */}
      <View style={styles.metaRow}>
        <Reanimated.Text
          entering={enter}
          numberOfLines={2}
          style={styles.titleText}
        >
          {title}
        </Reanimated.Text>
        <Reanimated.Text
          entering={enter}
          numberOfLines={1}
          style={styles.priceText}
        >
          {price}
        </Reanimated.Text>
      </View>

      {sellerName && (
        <Reanimated.Text entering={enter} numberOfLines={1} style={styles.sellerText}>
          {sellerName}
        </Reanimated.Text>
      )}

      {condition && (
        <View style={styles.conditionPill}>
          <Reanimated.Text entering={enter} style={styles.conditionText}>
            {condition}
          </Reanimated.Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  root: {
    marginBottom: Space.md },
  imageWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  saveBtn: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  videoBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full },
  metaRow: {
    marginTop: Space.xs,
    gap: Space.xxs },
  titleText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    color: colors.textPrimary },
  priceText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2 },
  sellerText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: 14,
    fontFamily: FontFamily.medium,
    color: colors.textSecondary,
    marginTop: Space.xxs },
  conditionPill: {
    alignSelf: 'flex-start',
    marginTop: Space.xs,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xxs,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  conditionText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: 14,
    fontFamily: FontFamily.medium,
    color: colors.textSecondary } });
