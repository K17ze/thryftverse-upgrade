import React from 'react';
import { View, StyleSheet, Dimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, FontFamily, Control } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { isVideoUri } from '../../utils/media';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const { width: SCREEN_W } = Dimensions.get('window');
const GAP = Space.sm;
const COLUMNS = 2;
const CARD_W = (SCREEN_W - Space.md * 2 - GAP) / COLUMNS;
const CARD_H = CARD_W * 1.25; // 4:5 ratio

interface FlagshipProductCardProps {
  imageUri: string;
  title: string;
  price: string;
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
  onPress,
  onToggleSave,
  isSaved = false,
  isWishlisted = false,
  sellerName,
  condition,
  style,
}: FlagshipProductCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const hasVideo = isVideoUri(imageUri);
  const reducedMotion = useReducedMotion();
  const saved = isSaved || isWishlisted;

  return (
    <Pressable onPress={onPress} style={[styles.root, { width: CARD_W }, style]}>
      <View style={[styles.imageWrap, { width: CARD_W, height: CARD_H }]}>
        <CachedImage
          uri={imageUri}
          style={{ width: CARD_W, height: CARD_H }}
          contentFit="cover"
          transition={300}
          priority="normal"
        />

        {/* Top-right save button — 44pt hit area, transparent by default */}
        {onToggleSave && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onToggleSave();
            }}
            style={styles.saveBtn}
            hitSlop={12}
            accessibilityLabel={saved ? 'Remove from saved' : 'Save item'}
            accessibilityRole="button"
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={20}
              color={saved ? colors.danger : '#fff'}
            />
          </Pressable>
        )}

        {/* Video indicator — compact, only when media is video */}
        {hasVideo && (
          <View style={styles.videoBadge}>
            <Ionicons name="videocam" size={12} color="#fff" />
          </View>
        )}
      </View>

      {/* Metadata below image — flat, no card shell */}
      <View style={styles.metaRow}>
        <Reanimated.Text
          entering={reducedMotion ? undefined : FadeIn}
          numberOfLines={2}
          style={styles.titleText}
        >
          {title}
        </Reanimated.Text>
        <Reanimated.Text
          entering={reducedMotion ? undefined : FadeIn}
          numberOfLines={1}
          style={styles.priceText}
        >
          {price}
        </Reanimated.Text>
      </View>

      {sellerName && (
        <Reanimated.Text entering={reducedMotion ? undefined : FadeIn} numberOfLines={1} style={styles.sellerText}>
          {sellerName}
        </Reanimated.Text>
      )}

      {condition && (
        <View style={styles.conditionPill}>
          <Reanimated.Text entering={reducedMotion ? undefined : FadeIn} style={styles.conditionText}>
            {condition}
          </Reanimated.Text>
        </View>
      )}
    </Pressable>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  root: {
    marginBottom: Space.md,
  },
  imageWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  saveBtn: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
  },
  metaRow: {
    marginTop: Space.xs,
    paddingHorizontal: 2,
    gap: 2,
  },
  titleText: {
    fontSize: Type.body.size,
    lineHeight: 18,
    fontFamily: FontFamily.medium,
    color: colors.textPrimary,
  },
  priceText: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  sellerText: {
    fontSize: Type.meta.size,
    lineHeight: 14,
    fontFamily: FontFamily.medium,
    color: colors.textSecondary,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  conditionPill: {
    alignSelf: 'flex-start',
    marginTop: Space.xs,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  conditionText: {
    fontSize: Type.meta.size,
    lineHeight: 14,
    fontFamily: FontFamily.medium,
    color: colors.textSecondary,
  },
});
