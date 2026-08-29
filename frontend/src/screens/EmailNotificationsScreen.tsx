/**
 * EmailNotificationsScreen — per-category email notification preferences.
 *
 * Separate from push notifications, this screen lets users control which
 * categories of events trigger email notifications. All categories default
 * to sensible values (security alerts on, marketing off).
 *
 * Categories are grouped into sections (Essential, Shopping, Co-Own, Marketing)
 * with coloured icon badges for visual identity — Pinterest/Instagram-quality
 * information hierarchy, not a flat list.
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
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: Exclude<keyof ThemeColors, 'outfitBackgrounds'>;
  defaultEnabled: boolean;
  locked?: boolean;
}

interface CategoryGroup {
  title: string;
  description: string;
  categories: CategoryConfig[];
}

const GROUPS: CategoryGroup[] = [
  {
    title: 'Essential',
    description: 'Critical account and transaction emails',
    categories: [
      {
        key: 'securityAlerts',
        label: 'Security alerts',
        description: 'New device logins, password changes, 2FA updates',
        icon: 'shield-checkmark',
        iconColor: 'success',
        defaultEnabled: true,
        locked: true,
      },
      {
        key: 'orderUpdates',
        label: 'Order updates',
        description: 'Purchases, shipping, delivery confirmations',
        icon: 'bag',
        iconColor: 'commerceTrust',
        defaultEnabled: true,
      },
      {
        key: 'messageNotifications',
        label: 'Messages',
        description: 'New messages from buyers and sellers',
        icon: 'mail',
        iconColor: 'social',
        defaultEnabled: true,
      },
    ],
  },
  {
    title: 'Shopping',
    description: 'Items, prices, and sellers you follow',
    categories: [
      {
        key: 'priceDropAlerts',
        label: 'Price drop alerts',
        description: 'When saved items drop in price',
        icon: 'trending-down',
        iconColor: 'danger',
        defaultEnabled: true,
      },
      {
        key: 'newListingsFromFollowing',
        label: 'New listings from followed sellers',
        description: 'When a followed seller posts a new item',
        icon: 'person-add',
        iconColor: 'discovery',
        defaultEnabled: true,
      },
      {
        key: 'auctionAlerts',
        label: 'Auction alerts',
        description: 'Outbid, auction ending, and auction won alerts',
        icon: 'trophy-outline',
        iconColor: 'bronze',
        defaultEnabled: true,
      },
    ],
  },
  {
    title: 'Co-Own',
    description: 'Distribution payments and governance events',
    categories: [
      {
        key: 'distributionNotices',
        label: 'Distribution notices',
        description: 'Dividend and revenue-share payments',
        icon: 'cash',
        iconColor: 'success',
        defaultEnabled: true,
      },
      {
        key: 'corporateActionNotices',
        label: 'Corporate actions',
        description: 'Governance votes, buybacks, splits',
        icon: 'briefcase',
        iconColor: 'bronze',
        defaultEnabled: true,
      },
    ],
  },
  {
    title: 'Marketing',
    description: 'Optional promotional content',
    categories: [
      {
        key: 'marketing',
        label: 'Promotions and offers',
        description: 'Featured collections, seasonal campaigns',
        icon: 'pricetag-outline',
        iconColor: 'antiqueGold',
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
        header={<FlagshipHeader title="Email Notifications" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Email Notifications" onBack={() => navigation.goBack()} />}
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
            subtitle={error}
            ctaLabel="Retry"
            onCtaPress={() => {
              setIsLoading(true);
              void load();
            }}
          />
        ) : (
          GROUPS.map((group) => (
            <SettingsSection key={group.title} title={group.title} description={group.description} noCard>
              {group.categories.map((category, idx) => (
                <SettingsRow
                  key={category.key}
                  icon={category.icon}
                  iconColor={category.iconColor ? colors[category.iconColor] : undefined}
                  title={category.label}
                  subtitle={category.description}
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
