import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Type, Typography, Radius } from '../../theme/designTokens';
import { useRenderTrace } from '../../performance/renderTrace';
import { isLookVideo, isLookCarousel, isLookMultiLayer } from '../../utils/lookTemplates';
import type { LookApiItem } from '../../services/looksApi';

export interface LookMasonryTileProps {
  look: LookApiItem;
  onPress: (lookId: string) => void;
  /** Aspect ratio (width/height) for the tile. Defaults to 4/5. */
  aspectRatio?: number;
  testID?: string;
  /** Visual variant: 'default' shows caption/creator overlay; 'explore' is
   *  Instagram-style — media-only with small media-type badges, no text. */
  variant?: 'default' | 'explore';
}

function LookMasonryTileImpl({
  look,
  onPress,
  aspectRatio = 4 / 5,
  testID,
  variant = 'default',
}: LookMasonryTileProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, variant), [colors, variant]);
  useRenderTrace('LookMasonryTile', { lookId: look.id, aspectRatio, variant });

  const creator = look.creator.username ?? 'creator';
  const caption = look.caption || look.title || '';
  const hasItems = look.tags.length > 0;
  const isVideo = isLookVideo(look);
  const isCarousel = isLookCarousel(look);
  const isMultiLayer = isLookMultiLayer(look);

  const handlePress = useCallback(() => onPress(look.id), [onPress, look.id]);

  // ── Explore variant: Instagram-style — media is the label ──────────────
  // No text overlays. Small media-type badges top-right. Pricetag badge
  // bottom-right. Tighter radius for discovery density.
  if (variant === 'explore') {
    return (
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${caption || 'Look'} by @${creator}`}
        accessibilityHint="Opens this look"
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        testID={testID}
      >
        <View style={[styles.imageWrap, { aspectRatio }]}>
          <ExpoImage
            source={{ uri: look.mediaUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="disk"
            recyclingKey={look.id}
            transition={160}
          />

          {/* Media-type badge — bare glyph top-right with drop-shadow for
              legibility over varying imagery. No chip/pill background —
              Instagram uses bare glyphs, not contained badges.
              Video → play icon, Carousel → stacked-layers icon,
              Multi-layer collage → layers icon. Single image → no badge. */}
          {(isVideo || isCarousel || isMultiLayer) && (
            <Ionicons
              name={isVideo ? 'play' : isCarousel ? 'copy' : 'layers'}
              size={16}
              color={styles.mediaBadgeIcon.color}
              style={styles.mediaBadge}
            />
          )}

          {/* Shoppable pricetag — bare glyph bottom-right with drop-shadow.
              No chip background — the glyph alone is the signal. */}
          {hasItems && (
            <Ionicons
              name="pricetag"
              size={14}
              color={styles.pricetagBadgeIcon.color}
              style={styles.pricetagBadgeExplore}
            />
          )}
        </View>
      </Pressable>
    );
  }

  // ── Default variant: caption/creator overlay on gradient scrim ──────────
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${caption || 'Look'} by @${creator}`}
      accessibilityHint="Opens this look"
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      testID={testID}
    >
      <View style={[styles.imageWrap, { aspectRatio }]}>
        <ExpoImage
          source={{ uri: look.mediaUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={look.id}
          transition={160}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)']}
          locations={[0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {hasItems && (
          <View style={styles.pricetagBadge}>
            <Ionicons name="pricetag" size={14} color={colors.scrimTextPrimary} />
          </View>
        )}
        {(caption || creator) && (
          <View style={styles.captionWrap}>
            {caption ? (
              <Text style={styles.caption} numberOfLines={2}>{caption}</Text>
            ) : null}
            <Text style={styles.creator} numberOfLines={1}>@{creator}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export const LookMasonryTile = React.memo(LookMasonryTileImpl);

const createStyles = (colors: ThemeColors, variant: 'default' | 'explore') => {
  const isExplore = variant === 'explore';
  return StyleSheet.create({
    tile: {
      borderRadius: isExplore ? Radius.md : Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    tilePressed: {
      opacity: 0.9,
    },
    imageWrap: {
      width: '100%',
      overflow: 'hidden',
    },

    // ── Default variant styles ──
    pricetagBadge: {
      position: 'absolute',
      top: Space.sm,
      right: Space.sm,
    },
    captionWrap: {
      position: 'absolute',
      left: Space.sm,
      right: Space.sm,
      bottom: Space.sm,
    },
    caption: {
      color: colors.scrimTextPrimary,
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
    },
    creator: {
      color: colors.scrimTextSecondary,
      fontFamily: Typography.family.regular,
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      marginTop: 2,
    },

    // ── Explore variant styles ──
    // Media badge: bare glyph, top-right. No chip/pill background —
    // Instagram uses bare glyphs with drop-shadow for legibility.
    // textShadow provides the scrim over varying imagery.
    mediaBadge: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 3,
    },
    mediaBadgeIcon: {
      color: 'rgba(255,255,255,0.95)',
    },
    // Pricetag badge for explore: bare glyph, bottom-right.
    pricetagBadgeExplore: {
      position: 'absolute',
      bottom: Space.xs,
      right: Space.xs,
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 3,
    },
    pricetagBadgeIcon: {
      color: 'rgba(255,255,255,0.95)',
    },
  });
};
