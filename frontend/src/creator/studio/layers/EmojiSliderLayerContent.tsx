import React from 'react';
import { View, Text } from 'react-native';
import { Radius } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { createOverlayStyles } from './layerContentShared';

export function EmojiSliderLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'emojiSlider' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const o = React.useMemo(() => createOverlayStyles(colors), [colors]);
  return (
    <View style={[o.overlayPill, { minWidth: 200, maxWidth: '100%' }]} accessibilityLabel={`Emoji slider, ${payload.emoji} ${payload.question}`}
    accessibilityHint="Viewers drag the slider to respond when published" accessibilityRole="adjustable">
      <Text style={[o.overlayBodySemibold, { marginBottom: 10, textAlign: 'center' }]}>{payload.question}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: TypographyV2.display.size }}>{payload.emoji}</Text>
        <View style={o.overlayTrack}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', borderRadius: Radius.full, backgroundColor: payload.sliderColor }} />
          <View style={[o.overlayThumb, { borderColor: payload.sliderColor }]} />
        </View>
        {payload.endLabel ? (
          <Text style={{ color: colors.textSecondary, fontFamily: TypographyV2.display.fontFamily, fontSize: TypographyV2.meta.size }}>{payload.endLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}
