import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';
import { Typography, Radius } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import type { LookApiItem } from '../../services/looksApi';
import { isVideoUri } from '../../utils/media';

interface ProfileLookTileProps {
  item: LookApiItem;
  onPress: () => void;
  cardWidth: number;
  cardHeight: number;
  gap: number;
}

/**
 * Look tile — 3:4 portrait, media-first fashion portfolio tile.
 * No card container, no title stack, minimal radius (2pt).
 * Consistent cover crop. Small video glyph. Small tagged-piece indicator.
 * Never displays two badges when one visual signal can communicate both.
 */
const ProfileLookTile = React.memo(function ProfileLookTile({
  item,
  onPress,
  cardWidth,
  cardHeight,
  gap,
}: ProfileLookTileProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const isVideo = isVideoUri(item.mediaUrl);
  const hasTags = item.tags && item.tags.length > 0;

  return (
    <AnimatedPressable
      style={[styles.lookCard, { width: cardWidth, marginBottom: gap }]}
      activeOpacity={0.92}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open Look ${item.title}`}
      accessibilityHint="Opens Look details"
    >
      <SharedTransitionView
        style={[styles.lookImageWrap, { width: cardWidth, height: cardHeight }]}
        sharedTransitionTag={`look-${item.id}`}
      >
        <CachedImage
          uri={item.mediaUrl}
          style={styles.lookImage}
          containerStyle={{ width: '100%', height: '100%', borderRadius: Radius.sm }}
          contentFit="cover"
          downscaleWidth={cardWidth}
        />
        {/* Single small badge bottom-right — video glyph takes priority,
            tagged indicator only when no video. One visual signal. */}
        {isVideo ? (
          <View style={styles.videoGlyph}>
            <View style={styles.videoPlayTriangle} />
          </View>
        ) : hasTags ? (
          <View style={styles.tagGlyph} />
        ) : null}
      </SharedTransitionView>
    </AnimatedPressable>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  lookCard: {},
  lookImageWrap: { borderRadius: Radius.md, overflow: 'hidden', position: 'relative' },
  lookImage: { width: '100%', height: '100%' },
  // Small video glyph — white circle with play triangle, subtle shadow
  videoGlyph: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: Radius.lg,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  videoPlayTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderLeftColor: colors.textPrimary,
    marginLeft: 2,
  },
  // Small tagged-piece indicator — subtle dark dot, no text
  tagGlyph: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: Radius.sm,
    backgroundColor: colors.overlay,
  },
  });
}

export { ProfileLookTile };
