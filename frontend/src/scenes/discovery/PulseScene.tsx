import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import PulseTab from '../../components/explore/PulseTab';

/**
 * PulseScene owns the Pulse feed's scroll surface.
 *
 * PulseTab already renders its own ScrollView and fetches its own data,
 * so this scene is a thin wrapper that gives Pulse an independent scroll
 * owner. Because the scene stays mounted (hidden) when another tab is
 * active, Pulse's scroll position is preserved across tab switches.
 */
export function PulseScene() {
  const { colors } = useAppTheme();

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
  });

  return (
    <View style={styles.container}>
      <PulseTab />
    </View>
  );
}
