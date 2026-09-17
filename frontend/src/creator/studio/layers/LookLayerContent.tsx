import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar, FontFamily } from '../../../theme/designTokens';
import { useAppTheme } from '../../../theme/ThemeContext';
import type { CreatorLayer } from '../../core/projectStore/composition';
import { createOverlayStyles } from './layerContentShared';

export function LookLayerContent({ layer }: { layer: Extract<CreatorLayer, { type: 'look' }> }) {
  const { payload } = layer;
  const { colors } = useAppTheme();
  const o = React.useMemo(() => createOverlayStyles(colors), [colors]);
  return (
    <View style={[o.overlayPill, { flexDirection: 'row', gap: 4 }]} accessibilityLabel={`Look, ${payload.snapshotCaption || 'View look'}`}
    accessibilityHint="Opens the look when published" accessibilityRole="link">
      <Ionicons name="shirt-outline" size={IconGrammar.badge} color={colors.textPrimary} aria-hidden={true} />
      <Text style={[o.overlayLabel, { fontFamily: FontFamily.medium }]} numberOfLines={1}>{payload.snapshotCaption || 'View look'}</Text>
    </View>
  );
}
