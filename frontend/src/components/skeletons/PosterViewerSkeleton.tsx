import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { Space, Radius, AspectRatio } from '../../theme/designTokens';

// Mirrors PosterViewerScreen layout: full-screen 9:16 dark immersive media
// viewer with story progress segments at top and a subtle media placeholder
// that matches the final geometry (full-screen, not a centered rectangle).
export function PosterViewerSkeleton() {
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  // The poster viewer fills the entire screen — the skeleton must match
  // that geometry so there's no layout shift when the real content loads.
  const mediaHeight = Math.min(SCREEN_H, SCREEN_W / AspectRatio.portraitTall);
  return (
    <View style={styles.container}>
      {/* Story progress segments — matches progressSegments layout */}
      <View style={styles.progressSegments}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: i === 0 ? '100%' : '0%' }]} />
          </View>
        ))}
      </View>

      {/* Media placeholder — full-screen 9:16 geometry with subtle shimmer.
          Matches the final canvas dimensions so there's no layout shift. */}
      <View style={styles.mediaArea}>
        <SkeletonLoader
          width={SCREEN_W}
          height={mediaHeight}
          borderRadius={Radius.none}
          style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
        />
      </View>

      {/* Bottom reply bar placeholder */}
      <View style={styles.replyBar}>
        <SkeletonLoader width={SCREEN_W * 0.6} height={40} borderRadius={Radius.xxl} style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  progressSegments: {
    flexDirection: 'row',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  mediaArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyBar: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
    alignItems: 'center',
  },
});
