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
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Control } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppButton } from '../components/ui/AppButton';
import { ConnectedAccountsSkeleton } from '../components/skeletons/ConnectedAccountsSkeleton';
import { EmptyState } from '../components/EmptyState';
import {
  fetchConnectedAccounts,
  unlinkConnectedAccount,
  type ConnectedAccount,
} from '../services/accountApi';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectedAccounts'>;

const PROVIDER_META: Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; gradient: string }> = {
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
      `You'll no longer be able to sign in with ${meta.label}. Ensure you have another way to access your account.`,
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
      <FlagshipScreen
        header={<FlagshipHeader title="Connected Accounts" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ConnectedAccountsSkeleton />
        </ScrollView>
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Connected Accounts" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); void load(); }} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero summary — visual identity for the screen */}
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

        <Text style={styles.introText}>
          Manage the third-party accounts you use to sign in. Unlink an account as long as you have another way to access your ThryftVerse account.
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
              <View style={styles.emptyIconWrap}>
                <Ionicons name="link-outline" size={36} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No connected accounts</Text>
              <Text style={styles.emptyBody}>
                You sign in with your email and password. Connect Google or Apple from the sign-in screen for faster access.
              </Text>
            </View>
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
                <View
                  key={account.id}
                >
                  <View style={styles.accountCard}>
                    <View style={styles.accountHeader}>
                      {/* Provider badge with brand colour */}
                      <View style={[styles.providerIcon, { backgroundColor: meta.color + '18' }]}>
                        <Ionicons name={meta.icon} size={24} color={meta.color} />
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
                </View>
              );
            })}
          </View>
        )}

        {/* Security note — elevated with icon and card */}
          <View style={styles.securityNote}>
            <View style={styles.securityIconWrap}>
              <Ionicons name="checkmark-done" size={20} color={colors.success} />
            </View>
            <View style={styles.securityTextWrap}>
              <Text style={styles.securityTitle}>Account safety</Text>
              <Text style={styles.securityNoteText}>
                For your security, you must keep at least one way to sign in. If you unlink your only connected account, ensure you have a password set.
              </Text>
            </View>
          </View>

        <View style={{ height: Space.xxl }} />
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      width: Control.hit,
      height: Control.hit,
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
      marginTop: Space.xs / 2,
    },

    introText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.body.lineHeight,
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
      width: Space.xl * 2,
      height: Space.xl * 2,
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
      lineHeight: Type.captionElevated.lineHeight,
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
      width: Control.hit,
      height: Control.hit,
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
      marginTop: Space.xs / 2,
    },
    linkedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs,
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
      width: Control.chrome,
      height: Control.chrome,
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
      marginBottom: Space.xs / 2,
    },
    securityNoteText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      lineHeight: Type.caption.lineHeight + 1,
    },
  });
}
