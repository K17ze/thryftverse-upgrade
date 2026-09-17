import React from 'react';
import { View, Text } from 'react-native';
import { Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';

// ── Weather layer content ──────────────────────────────────────────
export function WeatherLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'weather' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor ?? colors.mediaOverlayScrim,
      minWidth: 120 }} accessibilityLabel={`Weather, ${payload.temperature}° ${payload.condition}${payload.locationName ? `, ${payload.locationName}` : ''}`} accessibilityRole="text" accessibilityHint="Shows the weather at the chosen location">
      <Text style={{ fontSize: TypographyV2.priceList.size }}>{payload.emoji}</Text>
      <View style={{ gap: 1 }}>
        <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.caption.size, color: payload.textColor }} numberOfLines={1}>
          {payload.temperature}° {payload.condition}
        </Text>
        {payload.locationName ? (
          <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.meta.size, color: payload.textColor, opacity: 0.7 }} numberOfLines={1}>
            {payload.locationName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
