/**
 * EmailNotificationsScreen — per-category email notification preferences.
 *
 * Separate from push notifications, this screen lets users control which
 * categories of events trigger email notifications. All categories default
 * to sensible values (security alerts on, marketing off).
 *
 * Categories are grouped into sections (Essential, Shopping, Co-Own, Marketing).
 * Flat composition per AGENTS.md §4: hairline separators, no decorative icon
 * chrome, one-line rows.
 */

import React from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import {
  fetchEmailPreferences,
  updateEmailPreferences,
  type EmailPreferences,
} from '../services/accountApi';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailNotifications'>;

interface CategoryConfig {
  key: keyof EmailPreferences;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  defaultEnabled: boolean;
  locked?: boolean;
}

interface CategoryGroup {
  title: string;
  categories: CategoryConfig[];
}

const GROUPS: CategoryGroup[] = [
  {
    title: 'Essential',
    categories: [
      {
        key: 'securityAlerts',
        label: 'Security alerts',
        icon: 'lock-closed-outline',
        defaultEnabled: true,
        locked: true,
      },
      {
        key: 'orderUpdates',
        label: 'Order updates',
        icon: 'bag',
        defaultEnabled: true,
      },
      {
        key: 'messageNotifications',
        label: 'Messages',
        icon: 'mail',
        defaultEnabled: true,
      },
    ],
  },
  {
    title: 'Shopping',
    categories: [
      {
        key: 'priceDropAlerts',
        label: 'Price drops',
        icon: 'trending-down',
        defaultEnabled: true,
      },
      {
        key: 'newListingsFromFollowing',
        label: 'New listings',
        icon: 'person-add',
        defaultEnabled: true,
      },
      {
        key: 'auctionAlerts',
        label: 'Auction alerts',
        icon: 'trophy-outline',
        defaultEnabled: true,
      },
    ],
  },
  {
    title: 'Co-Own',
    categories: [
      {
        key: 'distributionNotices',
        label: 'Distribution notices',
        icon: 'cash',
        defaultEnabled: true,
      },
      {
        key: 'corporateActionNotices',
        label: 'Corporate actions',
        icon: 'briefcase',
        defaultEnabled: true,
      },
    ],
  },
  {
    title: 'Marketing',
    categories: [
      {
        key: 'marketing',
        label: 'Promotions',
        icon: 'megaphone-outline',
        defaultEnabled: false,
      },
    ],
  },
];

export default function EmailNotificationsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();

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
      show('Failed to update email preference. Try again.', 'error');
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
      <FlagshipScreen
        header={<FlagshipHeader title="Email notifications" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Email notifications" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              void load();
            }}
            tintColor={colors.textSecondary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {error && !preferences ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load preferences"
            ctaLabel="Retry"
            onCtaPress={() => {
              setIsLoading(true);
              void load();
            }}
          />
        ) : (
          GROUPS.map((group) => (
            <SettingsSection key={group.title} title={group.title} noCard>
              {group.categories.map((category, idx) => (
                <SettingsRow
                  key={category.key}
                  icon={category.icon}
                  title={category.label}
                  value={category.locked ? 'Always on' : undefined}
                  toggleValue={preferences?.[category.key] ?? category.defaultEnabled}
                  onToggle={(v) => handleToggle(category, v)}
                  disabled={updatingKeys.has(category.key) || category.locked}
                  isFirst={idx === 0}
                  isLast={idx === group.categories.length - 1}
                />
              ))}
            </SettingsSection>
          ))
        )}

        <View style={{ height: Space.xxl }} />
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
  });
}
