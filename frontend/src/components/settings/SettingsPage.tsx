import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Space } from '../../theme/designTokens';

export interface SettingsPageProps {
  title: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
  scrollEnabled?: boolean;
}

export function SettingsPage({
  title,
  onBack,
  rightAction,
  children,
  scrollEnabled = true,
}: SettingsPageProps) {
  const { colors, isDark } = useAppTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <ScreenHeader
        title={title}
        onBack={onBack}
        rightAction={rightAction}
        showBackButton
      />
      {scrollEnabled ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {children}
          <View style={{ height: Space.xl }} />
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },
  content: {
    flex: 1,
    paddingTop: Space.sm,
  },
});
