import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';
import { Colors } from '../../constants/colors';
import { Typography } from '../../theme/designTokens';
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
 * Look tile — 3:4 portrait, media-first, no permanent title stack.
 * Dense editorial portfolio tile, visually distinct from Shop.
 * Quieter markers: subtle video icon, minimal tag indicator.
 */
const ProfileLookTile = React.memo(function ProfileLookTile({
  item,
  onPress,
  cardWidth,
  cardHeight,
  gap,
}: ProfileLookTileProps) {
  const isVideo = isVideoUri(item.mediaUrl);
  return (
    <AnimatedPressable
      style={[styles.lookCard, { width: cardWidth, marginBottom: gap }]}
      activeOpacity={0.9}
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
          containerStyle={{ width: '100%', height: '100%', borderRadius: 2 }}
          contentFit="cover"
        />
        {/* Quieter video marker — small, subtle */}
        {isVideo ? (
          <View style={styles.videoBadge}>
            <View style={styles.videoDot} />
          </View>
        ) : null}
        {/* Quieter tag indicator — minimal, no black pill */}
        {item.tags && item.tags.length > 0 ? (
          <View style={styles.tagCountBadge}>
            <Text style={styles.tagCountText}>{item.tags.length}</Text>
          </View>
        ) : null}
      </SharedTransitionView>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  lookCard: {},
  lookImageWrap: { borderRadius: 2, overflow: 'hidden', position: 'relative' },
  lookImage: { width: '100%', height: '100%' },
  // Quieter video marker — small white dot with shadow, not a black pill
  videoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  videoDot: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopWidth: 0,
    borderLeftColor: 'transparent',
    marginLeft: 1,
  },
  // Quieter tag indicator — subtle, no black pill
  tagCountBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagCountText: { fontSize: 10, fontFamily: Typography.family.semibold, color: 'rgba(255,255,255,0.9)' },
});

export { ProfileLookTile };
