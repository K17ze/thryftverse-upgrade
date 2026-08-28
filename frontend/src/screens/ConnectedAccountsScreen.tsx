/**
 * ConnectedAccountsScreen — manage linked OAuth providers (Google, Apple).
 *
 * Shows which third-party providers are linked to the user's account,
 * allows unlinking with safety checks (must keep at least one auth method),
 * and provides education about the security implications.
 *
 * Per Design.md: utility canvas mode. Flat settings rows, no decorative
 * icon chrome, one icon family (Ionicons).
 */

import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppButton } from '../components/ui/AppButton';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { ConnectedAccountsSkeleton } from '../components/skeletons/ConnectedAccountsSkeleton';
import { EmptyState } from '../components/EmptyState';
import {
  fetchConnectedAccounts,
  unlinkConnectedAccount,
  type ConnectedAccount,
} from '../services/accountApi';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectedAccounts'>;

const PROVIDER_META: Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
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
        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load accounts"
            subtitle={error}
            ctaLabel="Retry"
            onCtaPress={() => { setIsLoading(true); void load(); }}
          />
        ) : (
          <SettingsSection
            title="Sign-in methods"
            description={`Manage the third-party accounts you use to sign in. Unlink an account as long as you have another way to access your ThryftVerse account.\n${accounts.length > 0 ? `${accounts.length} connected account${accounts.length !== 1 ? 's' : ''}` : 'Email and password'}`}
          >
            <SettingsRow
              icon="mail-outline"
              title="Email and password"
              subtitle="Active"
              isLast={accounts.length === 0}
            />
            {accounts.length === 0 ? (
              <SettingsRow
                icon="link-outline"
                title="No connected accounts"
                subtitle="Connect Google, Apple, or Facebook from the sign-in screen"
                isLast
              />
            ) : (
              accounts.map((account, idx) => {
                const meta = PROVIDER_META[account.provider] ?? {
                  label: account.provider,
                  icon: 'key-outline',
                  color: colors.textMuted,
                };
                const isUnlinking = unlinkingId === account.id;
                const isLast = idx === accounts.length - 1;
                return (
                  <SettingsRow
                    key={account.id}
                    icon={meta.icon}
                    iconColor={meta.color}
                    title={meta.label}
                    subtitle={account.providerEmail ?? `Linked ${formatDate(account.linkedAt)}`}
                    value={account.providerEmail ? `Linked ${formatDate(account.linkedAt)}` : undefined}
                    isLast={isLast}
                  >
                    <AppButton
                      title={isUnlinking ? 'Unlinking…' : 'Unlink'}
                      onPress={() => { haptic.light(); handleUnlink(account); }}
                      variant="secondary"
                      size="sm"
                      disabled={isUnlinking}
                    />
                  </SettingsRow>
                );
              })
            )}
          </SettingsSection>
        )}

        <SettingsInfoBanner
          tone="info"
          icon="shield-checkmark-outline"
          title="Account safety"
          description="For your security, you must keep at least one way to sign in. You cannot unlink your last connected account without a password."
        />

        <View style={{ height: Space.xxl }} />
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: { paddingHorizontal: Space.md, paddingBottom: Space.xl },
  });
}
