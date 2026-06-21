import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Space } from '../../theme/designTokens';

interface PosterProgressSegmentsProps {
  total: number;
  currentIndex: number;
  progress: number;
  isPaused?: boolean;
}

export function PosterProgressSegments({ total, currentIndex, progress, isPaused }: PosterProgressSegmentsProps) {
  return (
    <View style={styles.row} accessibilityLabel={`Frame ${currentIndex + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => {
        const fillPercent = i < currentIndex ? 100 : i === currentIndex ? progress * 100 : 0;
        return (
          <View key={i} style={styles.track}>
            <View style={[styles.fill, { width: `${fillPercent}%` }]} />
            {isPaused && i === currentIndex && <View style={styles.pauseBar} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    marginTop: Space.sm,
    paddingHorizontal: 12,
  },
  track: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 1,
    backgroundColor: '#fff',
  },
  pauseBar: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 1,
  },
});
