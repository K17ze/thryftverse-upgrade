import React from 'react';
import { View, Text } from 'react-native';
import { Space, Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { CreatorLayer } from '../../core/projectStore/composition';

// ── Hashtag layer content ──────────────────────────────────────────
export function HashtagLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'hashtag' }> }) {
  const { payload } = layer;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor,
      minWidth: 80 }} accessibilityLabel={`Hashtag, ${payload.tag}`} accessibilityRole="link" accessibilityHint="Opens the hashtag feed when published">
      <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.caption.size, color: payload.textColor }} numberOfLines={1}>
        #{payload.tag}
      </Text>
    </View>
  );
}
