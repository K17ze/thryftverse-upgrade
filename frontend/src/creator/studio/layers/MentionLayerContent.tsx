import React from 'react';
import { View, Text } from 'react-native';
import { Space } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { createOverlayStyles } from './layerContentShared';

export function MentionLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'mention' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const o = React.useMemo(() => createOverlayStyles(colors), [colors]);
  return (
    <View style={[o.overlayPill, { flexDirection: 'row', paddingHorizontal: Space.smMd, paddingVertical: Space.xs }]} accessibilityLabel={`Mention @${payload.username}`}
    accessibilityHint="Opens the mentioned profile when published" accessibilityRole="link">
      <Text style={o.overlayBodySemibold}>@{payload.username}</Text>
    </View>
  );
}
