import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { createOverlayStyles } from './layerContentShared';

export function QuizLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'quiz' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const o = React.useMemo(() => createOverlayStyles(colors), [colors]);
  return (
    <View style={[o.overlayPill, { gap: 10, minWidth: 180 }]} accessibilityLabel={`Quiz, ${payload.emoji} ${payload.question}`}
    accessibilityHint="Viewers answer this quiz when published" accessibilityRole="summary">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: TypographyV2.sectionTitle.size }}>{payload.emoji}</Text>
        <Text style={[o.overlayBody, { fontFamily: TypographyV2.sectionTitle.fontFamily, flex: 1 }]}>{payload.question}</Text>
      </View>
      <View style={{ gap: 6 }}>
        {payload.options.map((opt) => {
          const isCorrect = opt.id === payload.correctOptionId;
          return (
            <View key={opt.id} style={[
              o.overlayOption,
              { flexDirection: 'row', justifyContent: 'space-between', maxWidth: '100%', flex: 0 },
              isCorrect && o.overlayOptionCorrect,
            ]}>
              <Text style={[o.overlayOptionText, isCorrect && o.overlayOptionTextCorrect]}>
                {opt.label}
              </Text>
              {isCorrect && (
                <View style={o.overlayCorrectBadge}>
                  <Ionicons name="checkmark" size={IconGrammar.badge} color={colors.surface} aria-hidden={true} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
