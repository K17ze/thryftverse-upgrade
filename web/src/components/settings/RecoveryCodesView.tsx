'use client';

/**
 * RecoveryCodesView — /settings/security/recovery.
 *
 * The backup-code surface that pairs with two-factor: real crypto-random
 * codes issued on enable, copyable, regenerable (invalidating the previous
 * set). Honest scope: codes are generated and stored on this device —
 * production issues single-use codes verified server-side, which is why
 * they only exist while two-factor is on.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsSection } from './SettingsSection';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';

export function RecoveryCodesView() {
  const router = useRouter();
  const { show } = useToast();
  const hydrated = useHydrated();
  const twoFactorEnabled = useSettingsPrefs((s) => s.twoFactorEnabled);
  const backupCodes = useSettingsPrefs((s) => s.backupCodes);
  const generatedAt = useSettingsPrefs((s) => s.backupCodesGeneratedAt);
  const regenerateBackupCodes = useSettingsPrefs((s) => s.regenerateBackupCodes);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);
  const [copied, setCopied] = useState(false);

  if (!hydrated) {
    return (
      <div aria-busy aria-label="Loading recovery codes">
        <Skeleton className="h-[52px] w-full rounded-none" />
        <Skeleton className="mt-px h-40 w-full rounded-none" />
      </div>
    );
  }

  // Codes only exist while 2FA is on — they are the fallback for the
  // second factor, so without it there is nothing real to show.
  if (!twoFactorEnabled) {
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
