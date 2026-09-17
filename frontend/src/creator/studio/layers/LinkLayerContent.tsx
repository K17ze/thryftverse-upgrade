import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { CreatorLayer } from '../../core/projectStore/composition';

// ── Link layer content ─────────────────────────────────────────────
export function LinkLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'link' }> }) {
  const { payload } = layer;
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor,
      minWidth: 120 }} accessibilityLabel={`Link, ${payload.ctaText}`} accessibilityRole="link" accessibilityHint="Opens the linked URL when published">
      <Ionicons name="link-outline" size={IconGrammar.metadata} color={payload.textColor} aria-hidden={true} />
      <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.caption.size, color: payload.textColor }} numberOfLines={1}>
        {payload.ctaText}
      </Text>
    </View>
  );
}
