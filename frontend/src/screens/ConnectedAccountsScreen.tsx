/**
 * ConnectedAccountsScreen — manage linked OAuth providers (Google, Apple).
 *
 * Shows which third-party providers are linked to the user's account,
 * allows unlinking with safety checks (must keep at least one auth method),
 * and provides education about the security implications.
 *
 * Per Design.md: utility canvas mode. Quality from composition, hierarchy,
 * and visual identity — each provider has its own brand-coloured badge.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { ConnectedAccountsSkeleton } from '../components/skeletons/ConnectedAccountsSkeleton';
import { EmptyState } from '../components/EmptyState';
import {
  fetchConnectedAccounts,
  unlinkConnectedAccount,
  type ConnectedAccount,
} from '../services/accountApi';
import { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'ConnectedAccounts'>;

const PROVIDER_META: Record<string, { label: string; icon: string; color: string; gradient: string }> = {
  google: { label: 'Google', icon: 'logo-google', color: '#4285F4', gradient: '#4285F4' },
  apple: { label: 'Apple', icon: 'logo-apple', color: '#000000', gradient: '#333333' },
  facebook: { label: 'Facebook', icon: 'logo-facebook', color: '#1877F2', gradient: '#1877F2' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ConnectedAccountsScreen({ navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();

  const [accounts, setAccounts] = React.useState<ConnectedAccount[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      const data = await fetchConnectedAccounts();
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connected accounts');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleUnlink = (account: ConnectedAccount) => {
    const meta = PROVIDER_META[account.provider] ?? { label: account.provider };
    Alert.alert(
      `Unlink ${meta.label}?`,
      `You'll no longer be able to sign in with ${meta.label}. Make sure you have another way to access your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            setUnlinkingId(account.id);
            try {
              await unlinkConnectedAccount(account.id);
              haptic.success();
              show(`${meta.label} account unlinked`, 'success');
              await load();
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Failed to unlink account';
              show(message, 'error');
            } finally {
              setUnlinkingId(null);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Connected Accounts" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ConnectedAccountsSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Connected Accounts" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); void load(); }} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero summary — visual identity for the screen */}
        <Reanimated.View entering={FadeInDown.duration(300)}>
          <View style={styles.heroCard}>
            <View style={styles.heroIconRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="lock-closed" size={20} color={colors.textInverse} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Sign-in methods</Text>
                <Text style={styles.heroSubtitle}>
                  {accounts.length === 0
                    ? 'Email and password'
                    : `${accounts.length} connected account${accounts.length !== 1 ? 's' : ''}`}
                </Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        <Text style={styles.introText}>
          Manage the third-party accounts you use to sign in. You can unlink an account as long as you have another way to access your ThryftVerse account.
        </Text>

        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load accounts"
            subtitle={error}
            ctaLabel="Retry"
            onCtaPress={() => { setIsLoading(true); void load(); }}
          />
        ) : accounts.length === 0 ? (
          <Reanimated.View entering={FadeInDown.duration(300).delay(100)}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="link-outline" size={36} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No connected accounts</Text>
              <Text style={styles.emptyBody}>
                You sign in with your email and password. Connect Google or Apple from the sign-in screen for faster access.
              </Text>
            </View>
          </Reanimated.View>
        ) : (
          <View style={styles.accountsList}>
            {accounts.map((account, idx) => {
              const meta = PROVIDER_META[account.provider] ?? {
                label: account.provider,
                icon: 'key-outline',
                color: colors.textMuted,
                gradient: colors.textMuted,
              };
              const isUnlinking = unlinkingId === account.id;
              return (
                <Reanimated.View
                  key={account.id}
                  entering={FadeInDown.duration(300).delay(idx * 60)}
                >
                  <View style={styles.accountCard}>
                    <View style={styles.accountHeader}>
                      {/* Provider badge with brand colour */}
                      <View style={[styles.providerIcon, { backgroundColor: meta.color + '18' }]}>
                        <Ionicons name={meta.icon as any} size={24} color={meta.color} />
                      </View>
                      <View style={styles.accountInfo}>
                        <Text style={styles.providerName}>{meta.label}</Text>
                        {account.providerEmail ? (
                          <Text style={styles.providerEmail}>{account.providerEmail}</Text>
                        ) : null}
                        <View style={styles.linkedRow}>
                          <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                          <Text style={styles.linkedDate}>Linked {formatDate(account.linkedAt)}</Text>
                        </View>
                      </View>
                    </View>
                    <AppButton
                      title={isUnlinking ? 'Unlinking…' : 'Unlink'}
                      onPress={() => { haptic.light(); handleUnlink(account); }}
                      variant="secondary"
                      size="sm"
                      disabled={isUnlinking}
                    />
                  </View>
                </Reanimated.View>
              );
            })}
          </View>
        )}

        {/* Security note — elevated with icon and card */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(200)}>
          <View style={styles.securityNote}>
            <View style={styles.securityIconWrap}>
              <Ionicons name="shield-checkmark" size={20} color={colors.success} />
            </View>
            <View style={styles.securityTextWrap}>
              <Text style={styles.securityTitle}>Account safety</Text>
              <Text style={styles.securityNoteText}>
                For your security, you must keep at least one way to sign in. If you unlink your only connected account, make sure you have a password set.
              </Text>
            </View>
          </View>
        </Reanimated.View>

        <View style={{ height: Space.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingBody: { flex: 1 },
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },

    // Hero summary card
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
    heroText: {
      flex: 1,
    },
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

    introText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: 20,
      marginTop: Space.lg,
      marginBottom: Space.md,
    },

    // Empty state
    emptyCard: {
      alignItems: 'center',
      padding: Space.xl,
      gap: Space.sm,
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: Radius.full,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.xs,
    },
    emptyTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    emptyBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: Space.lg,
    },

    // Account cards
    accountsList: { gap: Space.sm },
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
    },
    accountHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      flex: 1,
    },
    providerIcon: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    accountInfo: { flex: 1 },
    providerName: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    providerEmail: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: 2,
    },
    linkedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: 4,
    },
    linkedDate: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },

    // Security note — elevated card
    securityNote: {
      flexDirection: 'row',
      gap: Space.md,
      marginTop: Space.lg,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: Space.md,
    },
    securityIconWrap: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      backgroundColor: colors.success + '15',
      justifyContent: 'center',
      alignItems: 'center',
    },
    securityTextWrap: {
      flex: 1,
    },
    securityTitle: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    securityNoteText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: 17,
    },
  });
}
