'use client';

/**
 * RecoveryCodesView — /settings/security/recovery.
 *
 * The backup-code surface that pairs with two-factor.
 *
 * Fixture mode: real crypto-random codes issued on enable, copyable and
 * regenerable on this device (each regenerate invalidates the last set).
 *
 * Live mode: the backend only ever reveals recovery codes once — in the
 * POST /auth/2fa/verify response at enrolment — and stores hashes. There
 * is no status or regenerate endpoint, so the honest live state is: gate
 * on the account's real `twoFactorEnabled` (from /users/me via the
 * session's accountIdentity), and when it's on explain that the codes
 * can't be shown again — a fresh set only comes with a fresh two-factor
 * setup. Locally minted fixture codes are never presented as account
 * codes.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsSection } from './SettingsSection';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';

const isLive = DATA_MODE === 'live';

export function RecoveryCodesView() {
  const router = useRouter();
  const { show } = useToast();
  const hydrated = useHydrated();
  const { accountIdentity, isGuest, sessionLoading } = useSession();
  const fixtureEnabled = useSettingsPrefs((s) => s.twoFactorEnabled);
  const backupCodes = useSettingsPrefs((s) => s.backupCodes);
  const generatedAt = useSettingsPrefs((s) => s.backupCodesGeneratedAt);
  const regenerateBackupCodes = useSettingsPrefs((s) => s.regenerateBackupCodes);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);
  const [copied, setCopied] = useState(false);

  // Codes only exist while 2FA is on — they are the fallback for the
  // second factor, so without it there is nothing real to show. Live mode
  // reads the account flag from /users/me, never the local mirror.
  const enabled = isLive
    ? accountIdentity?.twoFactorEnabled === true
    : hydrated && fixtureEnabled;

  if (isLive && (isGuest || sessionLoading)) {
    return (
      <EmptyState
        icon="lock"
        title="Sign in to manage recovery codes"
        subtitle="Recovery codes belong to your account's two-factor setup — sign in to see them."
        actionLabel="Sign in"
        onAction={() => router.push('/auth/login')}
      />
    );
  }

  if (!isLive && !hydrated) {
    return (
      <div aria-busy aria-label="Loading recovery codes">
        <Skeleton className="h-[52px] w-full rounded-none" />
        <Skeleton className="mt-px h-40 w-full rounded-none" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center border-y border-border-subtle px-5 py-10 text-center">
        <Icon name="lockOpen" size={24} className="text-text-muted" />
        <p className="mt-3 text-body-emphasis font-medium text-text-primary">
          Recovery codes need two-factor authentication
        </p>
        <p className="mt-1 max-w-sm text-body text-text-secondary">
          Codes are issued when you turn on two-factor — they’re the one-time
          fallback for signing in without your authenticator.
        </p>
        <Button
          variant="primary"
          size="md"
          className="mt-5"
          onClick={() => router.push('/settings/security')}
        >
          Go to security settings
        </Button>
      </div>
    );
  }

  if (isLive) {
    // Honest state: the platform stores only hashes of the codes it
    // issued at enrolment — display-once, with no status or regenerate
    // endpoint to call. The only real refresh path is a fresh two-factor
    // setup, which also replaces the authenticator key.
    return (
      <div className="flex flex-col items-center border-y border-border-subtle px-5 py-10 text-center">
        <Icon name="key" size={24} className="text-text-muted" />
        <p className="mt-3 text-body-emphasis font-medium text-text-primary">
          Two-factor is on — codes can’t be shown again
        </p>
        <p className="mt-1 max-w-sm text-body text-text-secondary">
          Your recovery codes were shown once when you set up two-factor;
          the platform stores only their hashes, so there’s nothing to
          display or regenerate here. If you’ve lost them, turn two-factor
          off and set it up again — that issues a fresh set (and a new
          authenticator key).
        </p>
        <Button
          variant="secondary"
          size="md"
          className="mt-5"
          onClick={() => router.push('/settings/security')}
        >
          Manage two-factor
        </Button>
      </div>
    );
  }

  const copyAll = async () => {
    if (!backupCodes) return;
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
      show('Recovery codes copied', 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      show('Couldn’t copy — select the codes and copy them manually', 'error');
    }
  };

  const requestRegenerate = () =>
    setConfirm({
      title: 'Generate new codes?',
      message:
        'Your current codes stop working the moment a new set is created. Only do this if you’ve lost them or think someone else saw them.',
      confirmLabel: 'Generate new',
      variant: 'destructive',
      onConfirm: () => {
        setConfirm(null);
        regenerateBackupCodes();
        show('New recovery codes generated — the old set is invalid', 'success');
      },
    });

  return (
    <>
      {!backupCodes ? (
        <div className="flex flex-col items-center border-y border-border-subtle px-5 py-10 text-center">
          <Icon name="key" size={24} className="text-text-muted" />
          <p className="mt-3 text-body-emphasis font-medium text-text-primary">
            No codes on this device
          </p>
          <p className="mt-1 max-w-sm text-body text-text-secondary">
            Two-factor is on, but no recovery codes were issued here. Generate
            a set and store it somewhere safe.
          </p>
          <Button
            variant="primary"
            size="md"
            className="mt-5"
            onClick={() => {
              regenerateBackupCodes();
              show('Recovery codes generated', 'success');
            }}
          >
            Generate recovery codes
          </Button>
        </div>
      ) : (
        <>
          <SettingsSection title="Your recovery codes">
            <div className="px-4 py-4 sm:px-5">
              <ol className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {backupCodes.map((code, i) => (
                  <li
                    key={code}
                    className="tnum flex items-baseline gap-2 font-mono text-body-emphasis text-text-primary"
                  >
                    <span className="w-4 text-meta text-text-muted">{i + 1}.</span>
                    {code}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-caption text-text-muted">
                Generated{' '}
                {generatedAt
                  ? new Date(generatedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'just now'}{' '}
                · each code is single-use in a production build.
              </p>
              <div className="mt-4 flex gap-3">
                <Button variant="secondary" size="md" fullWidth onClick={() => void copyAll()}>
                  {copied ? 'Copied' : 'Copy all'}
                </Button>
                <Button variant="outline" size="md" fullWidth onClick={requestRegenerate}>
                  Regenerate
                </Button>
              </div>
            </div>
          </SettingsSection>

          <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
            Keep these somewhere separate from your device — anyone with a
            code and your password can sign in. In this build the codes are
            generated and held on this device only; a production build issues
            single-use codes verified server-side.
          </p>
        </>
      )}

      <ConfirmSheet sheet={confirm} onDismiss={() => setConfirm(null)} />
    </>
  );
}
