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
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { EmptyState } from '../components/EmptyState';
import {
  fetchEmailPreferences,
  updateEmailPreferences,
  type EmailPreferences,
} from '../services/accountApi';
import { RootStackParamList } from '../navigation/types';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = StackScreenProps<RootStackParamList, 'EmailNotifications'>;

interface CategoryConfig {
  key: keyof EmailPreferences;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: keyof ThemeColors;
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
        icon: 'sparkles',
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
  const reducedMotionEnabled = useReducedMotion();

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

  // Count enabled categories for hero summary
  const allCategories = GROUPS.flatMap(g => g.categories);
  const enabledCount = allCategories.filter(c => preferences?.[c.key] ?? c.defaultEnabled).length;

  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Email Notifications" onBack={() => navigation.goBack()} />}>
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
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); void load(); }} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero summary — visual identity */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
          <View style={styles.heroCard}>
            <View style={styles.heroIconRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="mail" size={22} color={colors.textInverse} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Email preferences</Text>
                <Text style={styles.heroSubtitle}>
                  {enabledCount} of {allCategories.length} categories active
                </Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {error && !preferences ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load preferences"
            subtitle={error}
            ctaLabel="Retry"
            onCtaPress={() => { setIsLoading(true); void load(); }}
          />
        ) : (
          GROUPS.map((group, groupIdx) => (
            <Reanimated.View
              key={group.title}
              entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay((groupIdx + 1) * 80)}
            >
              {/* Section header */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{group.title}</Text>
                <Text style={styles.sectionDescription}>{group.description}</Text>
              </View>

              {/* Grouped card with category rows */}
              <View style={styles.categoriesList}>
                {group.categories.map((category, catIdx) => {
                  const isEnabled = preferences?.[category.key] ?? category.defaultEnabled;
                  const isUpdating = updatingKeys.has(category.key);
                  const isLocked = category.locked;
                  const iconColor = category.iconColor ? colors[category.iconColor] : colors.textSecondary;
                  return (
                    <View
                      key={category.key}
                      style={[
                        styles.categoryRow,
                        catIdx < group.categories.length - 1 && styles.categoryRowBorder,
                      ]}
                    >
                      {/* Coloured icon badge — visual identity per category */}
                      <View style={[styles.categoryIcon, { backgroundColor: iconColor + '18' }]}>
                        <Ionicons name={category.icon} size={20} color={iconColor} />
                      </View>
                      <View style={styles.categoryInfo}>
                        <View style={styles.categoryLabelRow}>
                          <Text style={styles.categoryLabel}>{category.label}</Text>
                          {isLocked && (
                            <View style={styles.lockedBadge}>
                              <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                              <Text style={styles.lockedText}>Always on</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.categoryDescription}>{category.description}</Text>
                      </View>
                      <Switch
                        value={isEnabled}
                        onValueChange={(v) => handleToggle(category, v)}
                        disabled={isUpdating || isLocked}
                        trackColor={{ false: colors.surfaceAlt, true: colors.brand }}
                        thumbColor="#fff"
                        accessibilityRole="switch"
                        accessibilityLabel={category.label}
                      />
                    </View>
                  );
                })}
              </View>
            </Reanimated.View>
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

    // Hero summary
    heroCard: {
      borderRadius: Radius.xl,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.lg,
      marginTop: Space.sm,
    },
    heroIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: 2,
    },

    // Section headers
    sectionHeader: {
      marginTop: Space.lg,
      marginBottom: Space.sm,
      paddingHorizontal: Space.xs,
    },
    sectionTitle: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      opacity: 0.7,
    },
    sectionDescription: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 2,
    },

    // Category cards
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
    },
    categoryRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    categoryIcon: {
      width: 36,
      height: 36,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    categoryInfo: { flex: 1 },
    categoryLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    categoryLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    lockedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.full,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: 2,
    },
    lockedText: {
      fontSize: 10,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
    categoryDescription: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 3,
      lineHeight: 16,
    },
  });
}
