import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Stroke, Typography } from '../../theme/designTokens';
import { getSlotLabel } from '../../services/styleGraph';
import { AppButton } from '../ui/AppButton';
import { T } from '../ui/Text';
import type { CompletionSuggestion } from './outfitBuilderViewModels';

export interface OutfitBuilderSuggestionCardProps {
  suggestion: CompletionSuggestion;
  onApply: () => void;
}

/** Style suggestion — heuristic (StyleGraph rules), not ML. */
function OutfitBuilderSuggestionCardImpl({
  suggestion,
  onApply }: OutfitBuilderSuggestionCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.aiCard, { marginHorizontal: Space.md, marginBottom: Space.md }]}>
      <View style={styles.aiRow}>
        <Ionicons name="bulb-outline" size={18} color={colors.brand} />
        <T.Caption color={colors.brand} style={{ fontFamily: Typography.family.bold }}>
          Style suggestion
        </T.Caption>
      </View>
      <T.Body color={colors.textSecondary} style={{ marginBottom: Space.sm }}>
        Add a <Text style={{ fontFamily: Typography.family.bold, color: colors.textPrimary }}>{getSlotLabel(suggestion.slot)}</Text> to improve your outfit score by +{suggestion.scoreImprovement}.
      </T.Body>
      <AppButton
        title={`Add ${suggestion.item.brand ?? ''} ${suggestion.item.title}`.trim()}
        variant="secondary"
        size="sm"
        onPress={onApply}
        icon={<Ionicons name="add-circle-outline" size={16} color={colors.brand} />}
      />
    </View>
  );
}

export const OutfitBuilderSuggestionCard = React.memo(OutfitBuilderSuggestionCardImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  aiCard: {
    paddingVertical: Space.md,
    borderTopWidth: Stroke.hairline,
    borderTopColor: colors.border },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.sm } });
}
