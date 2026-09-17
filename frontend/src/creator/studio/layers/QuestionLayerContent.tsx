import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { createOverlayStyles } from './layerContentShared';

export function QuestionLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'question' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const o = React.useMemo(() => createOverlayStyles(colors), [colors]);
  return (
    <View style={[o.overlayPill, { minWidth: 180, maxWidth: '100%' }, { backgroundColor: payload.backgroundColor }]} accessibilityLabel={`Question box, ${payload.prompt}`}
    accessibilityHint="Collects viewer responses when published" accessibilityRole="search">
      <Text style={[o.overlayBodySemibold, { fontSize: TypographyV2.bodyStrong.size, marginBottom: Space.sm }]}>{payload.prompt}</Text>
      <View style={o.overlayInputAffordance}>
        <Ionicons name="chatbubbles-outline" size={IconGrammar.metadata} color={colors.textSecondary} aria-hidden={true} />
        <Text style={{ flex: 1, color: colors.textSecondary, fontFamily: TypographyV2.bodyStrong.fontFamily, fontSize: TypographyV2.meta.size }}>{payload.placeholder}</Text>
        <View style={o.overlaySendHint}>
          <Ionicons name="arrow-up" size={IconGrammar.badge} color={colors.textMuted} aria-hidden={true} />
        </View>
      </View>
    </View>
  );
}
