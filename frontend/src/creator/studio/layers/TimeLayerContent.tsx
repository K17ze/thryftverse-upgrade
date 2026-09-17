import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';

// ── Time layer content ─────────────────────────────────────────────
export function TimeLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'time' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const date = new Date(payload.displayTime);
  const timeStr = payload.format === 'time'
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : payload.format === 'date'
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: payload.backgroundColor ?? colors.mediaOverlayScrim,
      minWidth: 80 }} accessibilityLabel={`Time, ${timeStr}`} accessibilityRole="text" accessibilityHint="Shows the chosen date or time">
      <Ionicons name="time-outline" size={IconGrammar.metadata} color={payload.textColor} aria-hidden={true} />
      <Text style={{ fontFamily: TypographyV2.meta.fontFamily, fontSize: TypographyV2.caption.size, color: payload.textColor }} numberOfLines={1}>
        {timeStr}
      </Text>
    </View>
  );
}
