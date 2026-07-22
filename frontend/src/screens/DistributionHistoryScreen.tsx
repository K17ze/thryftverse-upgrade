/**
 * DistributionHistoryScreen — view distribution history across positions.
 *
 * Spec 10 §7.1: distributions are first-class timeline entries. This screen
 * aggregates distribution events from the user's positions. Per AGENTS.md §11,
 * the backend is authoritative — this screen fails closed with an empty state
 * when no distribution data is available.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../utils/haptics';
import {
  CoOwnMarketHeader,
  CoOwnStateCanvas,
  CoOwnCorporateActionRow,
} from '../components/coown';

type RouteT = RouteProp<RootStackParamList, 'DistributionHistory'>;
type NavT = StackNavigationProp<RootStackParamList>;

export default function DistributionHistoryScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { colors, isDark } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const filterAssetId = route.params?.assetId;

  const [refreshing, setRefreshing] = React.useState(false);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) { navigation.goBack(); return; }
    navigation.navigate('Portfolio');
  }, [navigation]);

  const handleRefresh = React.useCallback(() => {
    haptics.tap();
    setRefreshing(true);
    // No backend endpoint for distributions yet — fail closed after a brief delay
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Per AGENTS.md §11: no fabricated distribution data.
  // The backend does not yet expose a distributions endpoint.
  // This screen truthfully shows an empty state.
  const hasDistributions = false;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Distributions"
        subtitle={filterAssetId ? 'For this position' : 'All positions'}
        onBack={handleBack}
      />

      {hasDistributions ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textSecondary}
            />
          }
        >
          {/* Distribution events would be listed here using CoOwnCorporateActionRow */}
        </ScrollView>
      ) : (
        <CoOwnStateCanvas
          variant="empty"
          title="No distributions yet"
          subtitle="When this position pays a distribution, it will appear here with the amount, record date, and payment date."
          actionLabel="Back to portfolio"
          onAction={() => { haptics.tap(); handleBack(); }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.sm,
  },
});
