import React from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { CheckoutHeader } from './CheckoutHeader';

interface Props {
  onClose: () => void;
  closeAccessibilityLabel: string;
  children: React.ReactNode;
}

// Shared shell for the checkout guard/dead-end states (item unavailable,
// signed out, self-purchase): SafeArea + status bar + close header.
export function CheckoutGuardScaffold({ onClose, closeAccessibilityLabel, children }: Props) {
  const { colors, isDark } = useAppTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
      <CheckoutHeader onClose={onClose} closeAccessibilityLabel={closeAccessibilityLabel} />
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
