import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SharedTransitionView } from '../SharedTransitionView';
import { Colors } from '../../constants/colors';
import type { LookApiItem } from '../../services/looksApi';
import { isVideoUri } from '../../utils/media';

const MUTED = Colors.textMuted;

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
 * Video marker + tag count only where relevant.
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
        {isVideo ? (
          <View style={styles.videoBadge}>
            <Ionicons name="play" size={10} color="#fff" />
          </View>
        ) : null}
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
  videoBadge: {
    position: 'absolute', top: 6, right: 6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  tagCountBadge: {
    position: 'absolute', bottom: 6, right: 6,
    minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  tagCountText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
});

export { ProfileLookTile };
