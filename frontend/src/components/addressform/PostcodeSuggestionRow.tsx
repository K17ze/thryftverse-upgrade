import React, { useMemo } from 'react';
import { Text, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { type PostcodeLookupResult } from '../../utils/postcodeLookup';
import { createAddressFormStyles } from './addressFormStyles';

export interface PostcodeSuggestionRowProps {
  suggestion: PostcodeLookupResult;
  onPress: () => void;
}

/** UK postcode autocomplete suggestion — tap to apply city/region. */
export function PostcodeSuggestionRow({ suggestion, onPress }: PostcodeSuggestionRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createAddressFormStyles(colors), [colors]);

  return (
    <Pressable
      style={styles.postcodeSuggestion}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Use ${suggestion.city}, ${suggestion.region} for this postcode`}
    >
      <AppIcon name="location" size={IconSize.xs} color="brand" opticalCenter accessible={false} />
      <Text style={styles.postcodeSuggestionText}>
        Use <Text style={styles.postcodeSuggestionBold}>{suggestion.city}</Text>
        {suggestion.region ? `, ${suggestion.region}` : ''}
      </Text>
      <AppIcon name="forward" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
    </Pressable>
  );
}
