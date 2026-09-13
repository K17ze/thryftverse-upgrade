import React from 'react';
import { View } from 'react-native';
import type { LookApiItem } from '../../services/looksApi';
import { resolveLookTemplate } from '../../utils/lookTemplates';
import { LookMasonryTile } from '../look/LookMasonryTile';

export interface LookExploreTileProps {
  look: LookApiItem;
  index: number;
  /** Column gutter — Space.xs (4px) for discovery density. */
  gap: number;
  onPress: (lookId: string) => void;
}

/**
 * Explore tile — Instagram-style: media-only, no text overlays,
 * media-type badges (video/carousel), template-driven aspect ratios for
 * masonry rhythm. Tighter gutters (Space.xs = 4px) for discovery density.
 */
function LookExploreTileImpl({ look, index, gap, onPress }: LookExploreTileProps) {
  const template = resolveLookTemplate(look, index, 1);
  return (
    <View style={{ paddingHorizontal: gap / 2, paddingBottom: gap, width: '100%' }}>
      <LookMasonryTile
        look={look}
        onPress={onPress}
        aspectRatio={template.aspect}
        variant="explore"
      />
    </View>
  );
}

export const LookExploreTile = React.memo(LookExploreTileImpl);
