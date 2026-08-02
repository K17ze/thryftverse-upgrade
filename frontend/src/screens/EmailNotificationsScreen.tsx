/**
 * EmailNotificationsScreen — per-category email notification preferences.
 *
 * Separate from push notifications, this screen lets users control which
 * categories of events trigger email notifications. All categories default
 * to sensible values (security alerts on, marketing off).
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { EmptyState } from '../components/EmptyState';
import {
  fetchEmailPreferences,
  updateEmailPreferences,
  type EmailPreferences,
} from '../services/accountApi';
import { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'EmailNotifications'>;

interface CategoryConfig {
  key: keyof EmailPreferences;
  label: string;
  description: string;
  icon: string;
  defaultEnabled: boolean;
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: 'securityAlerts',
    label: 'Security alerts',
    description: 'New device logins, password changes, 2FA updates',
    icon: 'shield-checkmark-outline',
    defaultEnabled: true,
  },
  {
    key: 'orderUpdates',
    label: 'Order updates',
    description: 'Purchases, shipping, delivery confirmations',
    icon: 'bag-outline',
    defaultEnabled: true,
  },
  {
    key: 'messageNotifications',
    label: 'Messages',
    description: 'New messages from buyers and sellers',
    icon: 'mail-outline',
    defaultEnabled: true,
  },
  {
    key: 'priceDropAlerts',
    label: 'Price drop alerts',
    description: 'When saved items drop in price',
    icon: 'trending-down-outline',
    defaultEnabled: true,
  },
  {
    key: 'newListingsFromFollowing',
    label: 'New listings from sellers you follow',
    description: 'When a followed seller posts a new item',
    icon: 'person-add-outline',
    defaultEnabled: true,
  },
  {
    key: 'distributionNotices',
    label: 'Co-Own distribution notices',
    description: 'Dividend and revenue-share payments',
    icon: 'cash-outline',
    defaultEnabled: true,
  },
  {
    key: 'corporateActionNotices',
    label: 'Co-Own corporate actions',
    description: 'Governance votes, buybacks, splits',
    icon: 'briefcase-outline',
    defaultEnabled: true,
  },
  {
    key: 'marketing',
    label: 'Promotions and offers',
    description: 'Featured collections, seasonal campaigns',
    icon: 'sparkles-outline',
    defaultEnabled: false,
  },
];

export default function EmailNotificationsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();

  const [preferences, setPreferences] = React.useState<EmailPreferences | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [updatingKeys, setUpdatingKeys] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const data = await fetchEmailPreferences();
      setPreferences(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load email preferences');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (category: CategoryConfig, value: boolean) => {
    if (!preferences) return;
    haptic.selection();
    // Optimistic update
    setPreferences({ ...preferences, [category.key]: value });
    setUpdatingKeys((prev) => new Set(prev).add(category.key));
    try {
      await updateEmailPreferences({ [category.key]: value });
    } catch {
      // Revert on failure
      setPreferences({ ...preferences, [category.key]: !value });
    } finally {
      setUpdatingKeys((prev) => {
        const next = new Set(prev);
        next.delete(category.key);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Email Notifications" onBack={() => navigation.goBack()} />
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Email Notifications" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); void load(); }} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.introText}>
          Choose which emails you'd like to receive. You can change these at any time.
        </Text>

        {error && !preferences ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load preferences"
            subtitle={error}
            ctaLabel="Retry"
            onCtaPress={() => { setIsLoading(true); void load(); }}
          />
        ) : (
          <View style={styles.categoriesList}>
            {CATEGORIES.map((category) => {
              const isEnabled = preferences?.[category.key] ?? category.defaultEnabled;
              const isUpdating = updatingKeys.has(category.key);
              return (
                <View key={category.key} style={styles.categoryRow}>
                  <View style={styles.categoryIcon}>
                    <Ionicons name={category.icon as any} size={20} color={colors.textSecondary} />
                  </View>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryLabel}>{category.label}</Text>
                    <Text style={styles.categoryDescription}>{category.description}</Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    onValueChange={(v) => handleToggle(category, v)}
                    disabled={isUpdating}
                    trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
                    thumbColor="#fff"
                    accessibilityRole="switch"
                    accessibilityLabel={category.label}
                  />
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
    introText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: 20,
      marginTop: Space.md,
      marginBottom: Space.lg,
    },
    categoriesList: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
      gap: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    categoryIcon: {
      width: 36,
      height: 36,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    categoryInfo: { flex: 1 },
    categoryLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    categoryDescription: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 2,
      lineHeight: 16,
    },
  });
}
