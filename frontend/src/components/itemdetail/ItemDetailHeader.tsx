import React from 'react';
import type { ComponentProps } from 'react';
import Reanimated, { type SharedValue } from 'react-native-reanimated';
import { CommerceDetailHeader } from '../commerce/detail';

export interface ItemDetailHeaderProps {
  /** Chrome-fade animated style — recedes as the dismiss drag progresses. */
  chromeStyle: ComponentProps<typeof Reanimated.View>['style'];
  /** Scroll offset SharedValue driving the collapse. */
  scrollY: SharedValue<number>;
  title: string;
  onBack: () => void;
  onShare: () => void;
}

/**
 * Collapsed scrolling header — quiet glyph hit targets, no large
 * rounded-square containers. Separate hit area from visible shape.
 * Wrapped in a chrome-fade layer so the header recedes as the
 * swipe-to-dismiss drag progresses.
 */
export function ItemDetailHeader({
  chromeStyle,
  scrollY,
  title,
  onBack,
  onShare,
}: ItemDetailHeaderProps) {
  return (
    <Reanimated.View style={chromeStyle}>
      <CommerceDetailHeader
        scrollY={scrollY}
        title={title}
        onBack={onBack}
        rightAction={{
          icon: 'share-outline',
          label: 'Share listing',
          onPress: onShare,
        }}
      />
    </Reanimated.View>
  );
}
