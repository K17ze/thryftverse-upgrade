'use client';

/**
 * ConnectedAccountsView — /settings/security/connected.
 *
 * Mirrors the mobile ConnectedAccountsScreen: the email/password status
 * row plus linked OAuth providers with unlink + confirm. The unlink guard
 * is real — you can't remove your last sign-in method. Fixture mode keeps
 * the local persistence mirror (unlinked ids + toast Undo); live mode
 * reads GET /users/me/connected-accounts and severs the grant with
 * DELETE /users/me/connected-accounts/:id — a server write with no Undo.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsSection } from './SettingsSection';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as securityService from '@/lib/api/services/security';
import { CONNECTED_ACCOUNTS } from '@/lib/data/fixtures-settings';
import type { ConnectedAccount } from '@/lib/contracts/settings';

const isLive = DATA_MODE === 'live';

// Provider brand glyphs don't exist in the io5 semantic set — a linked
// account reads as a 'link' row rather than faking a brand mark.
const PROVIDER_META: Record<ConnectedAccount['provider'], { label: string; icon: AppIconName }> = {
  google: { label: 'Google', icon: 'link' },
  apple: { label: 'Apple', icon: 'link' },
  facebook: { label: 'Facebook', icon: 'link' },
};

function formatLinkedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ConnectedAccountsView() {
  const { show } = useToast();
  const router = useRouter();
  const { isGuest, sessionLoading } = useSession();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const unlinkedIds = useSettingsPrefs((s) => s.unlinkedAccountIds);
  const unlinkConnectedAccountPref = useSettingsPrefs((s) => s.unlinkConnectedAccount);
  const relinkConnectedAccount = useSettingsPrefs((s) => s.relinkConnectedAccount);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);

  const liveAccounts = useQuery({
    queryKey: ['security', 'connected-accounts'],
    queryFn: ({ signal }) => securityService.fetchConnectedAccounts(signal),
    enabled: isLive && !isGuest,
    staleTime: 15_000,
  });
  const liveUnlink = useMutation({
    mutationFn: (id: string) => securityService.unlinkConnectedAccount(id),
    onSuccess: (_v, id) => {
      void queryClient.invalidateQueries({ queryKey: ['security', 'connected-accounts'] });
      const meta = liveAccounts.data?.accounts.find((a) => a.id === id);
      show(`${meta ? PROVIDER_META[meta.provider].label : 'Account'} unlinked`, 'success');
    },
    onError: (error) =>
      show(parseApiError(error).message || 'Could not unlink that account', 'error'),
  });

  if (isLive && (isGuest || sessionLoading)) {
    return (
      <EmptyState
        icon="link"
        title="Sign in to see connected accounts"
        subtitle="Linked sign-in providers belong to your account — sign in to manage them."
        actionLabel="Sign in"
        onAction={() => router.push('/auth/login')}
      />
    );
  }

  if (isLive ? liveAccounts.isLoading : !hydrated) {
    return (
      <div aria-busy aria-label="Loading connected accounts">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  const accounts = isLive
    ? (liveAccounts.data?.accounts ?? [])
    : CONNECTED_ACCOUNTS.accounts.filter((a) => !unlinkedIds.includes(a.id));
  // Live takes the backend verbatim — absent `hasPassword` means "unknown",
  // so the unlink guard refuses rather than risk severing the last method.
  const hasPassword = isLive
    ? liveAccounts.data?.hasPassword === true
    : CONNECTED_ACCOUNTS.hasPassword;

  const requestUnlink = (account: ConnectedAccount) => {
    const meta = PROVIDER_META[account.provider];
    // Same rule as mobile: never unlink the last remaining sign-in method.
    const lastMethod = accounts.length === 1 && !hasPassword;
    if (lastMethod) {
      setConfirm({
        title: `Can't unlink ${meta.label}`,
        message:
          'This is your only way to sign in. Add a password or connect another account first.',
        confirmLabel: 'Got it',
        variant: 'default',
        onConfirm: () => setConfirm(null),
      });
      return;
    }
    setConfirm({
      title: `Unlink ${meta.label}?`,
      message: `You'll no longer be able to sign in with ${meta.label}. Make sure you have another way into your account.`,
      confirmLabel: 'Unlink',
      variant: 'destructive',
      onConfirm: () => {
        setConfirm(null);
        if (isLive) {
          liveUnlink.mutate(account.id);
          return;
        }
        unlinkConnectedAccountPref(account.id);
        show(`${meta.label} account unlinked`, 'info', {
          label: 'Undo',
          onPress: () => relinkConnectedAccount(account.id),
        });
      },
    });
  };

  return (
    <>
      <SettingsSection title="Sign-in methods">
        {/* Email/password status — truthful state, no dead CTA (there is no
            add-password route; change-password requires a current one). */}
        <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
          <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
            <Icon name="mail" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body-emphasis text-text-primary">Email and password</p>
            <p className="clamp-1 mt-0.5 text-caption text-text-muted">
              {hasPassword ? 'Active' : 'Not set'}
            </p>
          </div>
        </div>

        {isLive && liveAccounts.isError ? (
          <div className="px-4 py-3.5 sm:px-5">
            <p className="text-caption text-text-muted">
              {parseApiError(liveAccounts.error).message ||
                'Connected accounts could not be loaded.'}
            </p>
            <button
              type="button"
              onClick={() => void liveAccounts.refetch()}
              className="pressable mt-1 inline-flex min-h-11 items-center text-caption font-semibold text-text-primary"
            >
              Try again
            </button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
            <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
              <Icon name="link" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-emphasis text-text-primary">No connected accounts</p>
              <p className="clamp-1 mt-0.5 text-caption text-text-muted">
                Connect Google, Apple or Facebook from the sign-in screen
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {accounts.map((account) => {
              const meta = PROVIDER_META[account.provider];
              return (
                <li key={account.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
                    <Icon name={meta.icon} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-body-emphasis text-text-primary">{meta.label}</p>
                    <p className="clamp-1 mt-0.5 text-caption text-text-muted">
                      {account.providerEmail ?? `Linked ${formatLinkedAt(account.linkedAt)}`}
                    </p>
                  </div>
                  <span className="hidden text-meta text-text-muted sm:block">
                    Linked {formatLinkedAt(account.linkedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => requestUnlink(account)}
                    disabled={liveUnlink.isPending}
                    className="pressable -my-2 inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-caption font-semibold text-danger-text hover:bg-danger-subtle disabled:opacity-50"
                  >
                    Unlink
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsSection>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        For your security, you always keep at least one way to sign in — you
        can’t unlink your last connected account without a password.
        {isLive
          ? ' Unlinking severs the OAuth grant server-side — re-connecting requires signing in with the provider again.'
          : ' In this build the list comes from this device’s account data and unlinks are held locally; production severs the OAuth grant server-side.'}
      </p>

      <ConfirmSheet sheet={confirm} onDismiss={() => setConfirm(null)} />
    </>
  );
}
