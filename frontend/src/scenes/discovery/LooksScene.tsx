import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import LooksTab from '../../components/explore/LooksTab';

/**
 * LooksScene owns the Looks feed's scroll surface.
 *
 * LooksTab already renders its own FlatList (with refresh, pagination
 * and loading/empty/error states) and fetches its own data, so this
 * scene is a thin wrapper that gives Looks an independent scroll owner.
 * Because the scene stays mounted (hidden) when another tab is active,
 * Looks's scroll position is preserved across tab switches.
 */
export function LooksScene() {
  const { colors } = useAppTheme();

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
  });

  return (
    <View style={styles.container}>
      <LooksTab />
    </View>
  );
}
