import React from 'react';
import { View } from 'react-native';

interface Props {
  /** Unique key for the current content — kept for API compatibility */
  segmentKey: string;
  children: React.ReactNode;
}

/**
 * Instant segment swap — no animation.
 * The previous fade + slide transition was disruptive and annoying.
 * Content now swaps immediately when the segment changes.
 */
export function SegmentContentTransition({ segmentKey, children }: Props) {
  return (
    <View>
      {children}
    </View>
  );
}
