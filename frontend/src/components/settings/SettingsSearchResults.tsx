import React from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { RootStackParamList } from '../../navigation/types';
import type { DestinationMeta } from '../../hooks/settings/settingsRouteMetadata';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { createSettingsScreenStyles } from './settingsScreenStyles';

const styles = createSettingsScreenStyles();

export interface SettingsSearchResultsProps {
  results: DestinationMeta[];
  /** Clears the search query and navigates to the selected destination. */
  onSelectResult: (key: keyof RootStackParamList) => void;
}

/** Search results — flat filtered list rendered in place of the sectioned
 *  settings hierarchy while a query is active. */
export function SettingsSearchResults({ results, onSelectResult }: SettingsSearchResultsProps) {
  const { colors } = useAppTheme();
  const { t: ts } = useAppTranslation('settings');

  return (
    <SettingsSection title={results.length > 0 ? ts('search.results') : ts('search.allSettings')} noCard>
      {results.length === 0 ? (
        <View style={styles.emptySearch}>
          <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>
            {ts('search.noMatching')}
          </Text>
        </View>
      ) : (
        results.map((dest, i) => (
          <SettingsRow
            key={`${dest.key}-${i}`}
            title={dest.label}
            subtitle={dest.section}
            onPress={() => onSelectResult(dest.key)}
            isFirst={i === 0}
            isLast={i === results.length - 1}
          />
        ))
      )}
    </SettingsSection>
  );
}
