import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';

// ── Location layer content ─────────────────────────────────────────
export function LocationLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'location' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.mediaOverlayScrim,
      minWidth: 100 }} accessibilityLabel={`Location, ${payload.placeName}`} accessibilityRole="link" accessibilityHint="Opens this location when published">
      <Ionicons name="location-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} aria-hidden={true} />
      <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.caption.size, color: colors.scrimTextPrimary }} numberOfLines={1}>
        {payload.placeName}
      </Text>
    </View>
  );
}
