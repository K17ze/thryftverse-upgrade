/**
 * GroupMediaStrip — horizontal shared-media preview rail for the group
 * details screen.
 *
 * Owns its three states: loading (spinner row), error (tap-to-retry line)
 * and ready (64pt thumbnails; videos carry a scrim play badge). The caller
 * renders nothing when the strip is empty — the section row above it still
 * navigates to the full media screen.
 */

import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { useAppTheme } from '../../theme/ThemeContext';
import { FontFamily, Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface GroupMediaStripItem {
  id: string;
  uri: string;
  mediaType: 'image' | 'video' | 'document';
}

export interface GroupMediaStripProps {
  state: 'loading' | 'ready' | 'error';
  items: GroupMediaStripItem[];
  onRetry: () => void;
  onPressItem: (item: GroupMediaStripItem) => void;
}

export function GroupMediaStrip({ state, items, onRetry, onPressItem }: GroupMediaStripProps) {
  const { colors } = useAppTheme();

  if (state === 'loading') {
    return (
      <View style={styles.stateRow} accessibilityLabel="Loading shared media">
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  }

  if (state === 'error') {
    return (
      <AnimatedPressable
        onPress={onRetry}
        style={styles.stateRow}
        activeOpacity={0.7}
        scaleValue={0.98}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Retry loading shared media"
      >
        <AppIcon name="refresh" size="xs" color="textMuted" accessible={false} />
        <Text style={[styles.stateText, { color: colors.textMuted }]}>
          Could not load media. Tap to retry.
        </Text>
      </AnimatedPressable>
    );
  }

  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {items.map((item) => {
        const isVideo = item.mediaType === 'video';
        return (
          <AnimatedPressable
            key={item.id}
            onPress={() => onPressItem(item)}
            style={[styles.thumbnail, { backgroundColor: colors.surfaceAlt }]}
            activeOpacity={0.8}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={isVideo ? 'Video preview' : 'Photo preview'}
          >
            <CachedImage uri={item.uri} style={styles.thumbnailImg} contentFit="cover" />
            {isVideo ? (
              <View style={[styles.videoBadge, { backgroundColor: colors.mediaOverlayScrim }]}>
                <AppIcon name="play" variant="filled" size="micro" color="mediaOverlayText" accessible={false} />
              </View>
            ) : null}
          </AnimatedPressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stateRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
  },
  stateText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
  },
  strip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    gap: Space.xs,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
