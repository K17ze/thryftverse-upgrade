import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Type, Typography, Radius } from '../../theme/designTokens';
import { useRenderTrace } from '../../performance/renderTrace';
import type { LookApiItem } from '../../services/looksApi';

export interface LookMasonryTileProps {
  look: LookApiItem;
  onPress: (lookId: string) => void;
  /** Aspect ratio (width/height) for the tile. Defaults to 4/5. */
  aspectRatio?: number;
  testID?: string;
}

function LookMasonryTileImpl({ look, onPress, aspectRatio = 4 / 5, testID }: LookMasonryTileProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  useRenderTrace('LookMasonryTile', { lookId: look.id, aspectRatio });

  const creator = look.creator.username ?? 'creator';
  const caption = look.caption || look.title || '';
  const hasItems = look.tags.length > 0;

  const handlePress = useCallback(() => onPress(look.id), [onPress, look.id]);

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
            <Ionicons name="pricetag" size={14} color="#FFFFFF" />
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  tile: {
    borderRadius: Radius.lg,
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
    color: '#FFFFFF',
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  creator: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    marginTop: 2,
  },
});
