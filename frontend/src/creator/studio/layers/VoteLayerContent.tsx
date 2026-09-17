import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar, FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { createOverlayStyles } from './layerContentShared';

export function VoteLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'vote' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const o = React.useMemo(() => createOverlayStyles(colors), [colors]);
  const hasTimer = payload.timerMs !== undefined && payload.timerMs > 0;
  const timerSeconds = hasTimer ? Math.round(payload.timerMs! / 1000) : 0;
  const timerLabel = timerSeconds >= 3600
    ? `${Math.floor(timerSeconds / 3600)}h`
    : timerSeconds >= 60
      ? `${Math.floor(timerSeconds / 60)}m`
      : `${timerSeconds}s`;

  return (
    <View
      style={[o.overlayPill, { gap: 8, minWidth: 160 }, payload.backgroundColor && { backgroundColor: payload.backgroundColor }]}
      accessibilityLabel={`Poll, ${payload.question}${hasTimer ? `, ${timerLabel} timer` : ''}`}
      accessibilityHint="Viewers vote on this poll when published"
      accessibilityRole="summary"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Text style={[o.overlayBodySemibold, { textAlign: 'center', flexShrink: 1 }]}>{payload.question}</Text>
        {hasTimer && (
          <View style={o.overlayTimerBadge}>
            <Ionicons name="timer-outline" size={IconGrammar.badge} color={colors.textPrimary} aria-hidden={true} />
            <Text style={[o.overlayLabel, { fontFamily: TypographyV2.body.fontFamily }]}>{timerLabel}</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {payload.options.map((opt) => (
          <View key={opt.id} style={o.overlayOption}>
            <Text style={[o.overlayLabel, { fontFamily: FontFamily.medium, fontSize: TypographyV2.caption.size }]} numberOfLines={1}>{opt.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
