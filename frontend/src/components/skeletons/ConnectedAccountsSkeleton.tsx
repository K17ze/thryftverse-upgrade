import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonLoader } from '../SkeletonLoader';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';

// Mirrors ConnectedAccountsScreen layout: hero summary card (icon + title + subtitle),
// intro text line, list of account cards (provider badge + name/email + unlink button).
export function ConnectedAccountsSkeleton() {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Hero summary card */}
      <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
        <View style={styles.heroIconRow}>
          <SkeletonLoader width={40} height={40} borderRadius={Radius.full} />
          <View style={styles.heroText}>
            <SkeletonLoader width={130} height={16} borderRadius={Radius.sm} />
            <SkeletonLoader width={160} height={12} borderRadius={Radius.sm} style={{ marginTop: 6 }} />
          </View>
        </View>
      </View>

      {/* Intro text */}
      <SkeletonLoader width="92%" height={13} borderRadius={Radius.sm} />
      <SkeletonLoader width="78%" height={13} borderRadius={Radius.sm} />

      {/* Account cards */}
      <View style={styles.accountsList}>
        {Array.from({ length: 2 }).map((_, i) => (
          <View key={i} style={[styles.accountCard, { backgroundColor: colors.surface }]}>
            <View style={styles.accountHeader}>
              <SkeletonLoader width={48} height={48} borderRadius={Radius.full} />
              <View style={styles.accountInfo}>
                <SkeletonLoader width={100} height={15} borderRadius={Radius.sm} />
                <SkeletonLoader width={160} height={12} borderRadius={Radius.sm} style={{ marginTop: 6 }} />
                <SkeletonLoader width={90} height={11} borderRadius={Radius.sm} style={{ marginTop: Space.xs }} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    gap: Space.sm,
  },
  heroCard: {
    borderRadius: Radius.xl,
    padding: Space.md,
    marginBottom: Space.xs,
  },
  heroIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  heroText: {
    flex: 1,
    gap: 4,
  },
  accountsList: {
    gap: Space.sm,
    marginTop: Space.md,
  },
  accountCard: {
    borderRadius: Radius.xl,
    padding: Space.md,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  accountInfo: {
    flex: 1,
  },
});
