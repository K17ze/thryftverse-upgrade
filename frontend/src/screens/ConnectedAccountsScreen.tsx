/**
 * ConnectedAccountsScreen — manage linked OAuth providers (Google, Apple).
 *
 * Shows which third-party providers are linked to the user's account,
 * allows unlinking with safety checks (must keep at least one auth method),
 * and provides education about the security implications.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/EmptyState';
import {
  fetchConnectedAccounts,
  unlinkConnectedAccount,
  type ConnectedAccount,
} from '../services/accountApi';
import { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'ConnectedAccounts'>;

const PROVIDER_META: Record<string, { label: string; icon: string; color: string }> = {
  google: { label: 'Google', icon: 'logo-google', color: '#4285F4' },
  apple: { label: 'Apple', icon: 'logo-apple', color: '#000000' },
  facebook: { label: 'Facebook', icon: 'logo-facebook', color: '#1877F2' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ConnectedAccountsScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
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
        <View style={styles.loadingBody}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
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
          <View style={styles.emptyCard}>
            <Ionicons name="link-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No connected accounts</Text>
            <Text style={styles.emptyBody}>
              You sign in with your email and password. You can connect Google or Apple from the sign-in screen.
            </Text>
          </View>
        ) : (
          <View style={styles.accountsList}>
            {accounts.map((account) => {
              const meta = PROVIDER_META[account.provider] ?? { label: account.provider, icon: 'key-outline', color: colors.textMuted };
              const isUnlinking = unlinkingId === account.id;
              return (
                <View key={account.id} style={styles.accountCard}>
                  <View style={styles.accountHeader}>
                    <View style={[styles.providerIcon, { backgroundColor: meta.color + '15' }]}>
                      <Ionicons name={meta.icon as any} size={22} color={meta.color} />
                    </View>
                    <View style={styles.accountInfo}>
                      <Text style={styles.providerName}>{meta.label}</Text>
                      {account.providerEmail ? (
                        <Text style={styles.providerEmail}>{account.providerEmail}</Text>
                      ) : null}
                      <Text style={styles.linkedDate}>Linked {formatDate(account.linkedAt)}</Text>
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
              );
            })}
          </View>
        )}

        <View style={styles.securityNote}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.success} />
          <Text style={styles.securityNoteText}>
            For your security, you must keep at least one way to sign in. If you unlink your only connected account, make sure you have a password set.
          </Text>
        </View>

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
    emptyCard: {
      alignItems: 'center',
      padding: Space.xl,
      gap: Space.sm,
    },
    emptyTitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    emptyBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
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
      width: 40,
      height: 40,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    accountInfo: { flex: 1 },
    providerName: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    providerEmail: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      marginTop: 2,
    },
    linkedDate: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: 2,
    },
    securityNote: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.lg,
      paddingHorizontal: Space.sm,
    },
    securityNoteText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      lineHeight: 16,
      flex: 1,
    },
  });
}
