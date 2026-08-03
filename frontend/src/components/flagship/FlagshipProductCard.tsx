import React from 'react';
import { View, StyleSheet, Dimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type } from '../../theme/designTokens';
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

        {/* Top-right save button */}
        {onToggleSave && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onToggleSave();
            }}
            style={styles.saveBtn}
            hitSlop={12}
          >
            <Ionicons
              name={isSaved || isWishlisted ? 'heart' : 'heart-outline'}
              size={20}
              color={isSaved || isWishlisted ? colors.danger : '#fff'}
            />
          </Pressable>
        )}

        {/* Video indicator */}
        {hasVideo && (
          <View style={styles.videoBadge}>
            <Ionicons name="videocam" size={12} color="#fff" />
          </View>
        )}

        {/* Bottom gradient + text */}
        <View style={styles.bottomOverlay}>
          <View style={styles.textRow}>
            <Reanimated.Text
              entering={reducedMotion ? undefined : FadeIn}
              numberOfLines={1}
              style={styles.priceText}
            >
              {price}
            </Reanimated.Text>
          </View>
        </View>
      </View>

      {/* Title below image */}
      <View style={styles.metaRow}>
        <Reanimated.Text entering={reducedMotion ? undefined : FadeIn} numberOfLines={2} style={styles.titleText}>
          {title}
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
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    justifyContent: 'flex-end',
    padding: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceText: {
    fontSize: Type.price.size,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  metaRow: {
    marginTop: Space.xs,
    paddingHorizontal: 2,
  },
  titleText: {
    fontSize: Type.body.size,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  sellerText: {
    fontSize: Type.meta.size,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  conditionPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  conditionText: {
    fontSize: Type.meta.size,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
