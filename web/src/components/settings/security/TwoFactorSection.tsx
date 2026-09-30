'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { AuthField } from '@/components/auth/AuthField';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as securityService from '@/lib/api/services/security';
import { Switch } from '../Switch';

const isLive = DATA_MODE === 'live';

type TwoFactorStep = 'key' | 'codes' | 'disable';

export function TwoFactorSection() {
  const { show } = useToast();
  const { accountIdentity, refreshSession } = useSession();
  const hydrated = useHydrated();
  const fixtureEnabled = useSettingsPrefs((s) => s.twoFactorEnabled);
  const setEnabled = useSettingsPrefs((s) => s.setTwoFactorEnabled);
  const clearBackupCodes = useSettingsPrefs((s) => s.clearBackupCodes);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<TwoFactorStep>('key');
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = isLive ? accountIdentity?.twoFactorEnabled === true : hydrated && fixtureEnabled;

  if (!isLive && !hydrated) {
    return (
      <div aria-busy aria-label="Loading sign-in protection">
        <Skeleton className="h-[52px] w-full rounded-none" />
      </div>
    );
  }

  const closeSheet = () => {
    setSheetOpen(false);
    setCode('');
    setError(null);
    setSecret(null);
    setOtpauthUrl(null);
    setRecoveryCodes([]);
  };

  const openEnroll = async () => {
    setSheetOpen(true);
    setStep('key');
    setBusy(true);
    setError(null);
    try {
      const { secret: s, otpauthUrl: url } = await securityService.enrollTwoFactor();
      setSecret(s);
      setOtpauthUrl(url);
    } catch (e) {
      setError(parseApiError(e).message || 'Could not start two-factor setup');
    } finally {
      setBusy(false);
    }
  };

  const submitVerify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { recoveryCodes: codes } = await securityService.verifyTwoFactor(code.trim());
      setRecoveryCodes(codes);
      setStep('codes');
      void refreshSession();
      show('Two-factor enabled', 'success');
    } catch (e) {
      setError(parseApiError(e).message || 'That code didn’t work — check your authenticator');
    } finally {
      setBusy(false);
    }
  };

  const submitDisable = async () => {
    setBusy(true);
    setError(null);
    try {
      // The backend accepts either a live TOTP code or a recovery code.
      await securityService.disableTwoFactor({ code: code.trim() });
      closeSheet();
      void refreshSession();
      show('Two-factor authentication disabled', 'info');
    } catch {
      // A recovery code also satisfies the requirement
      try {
        await securityService.disableTwoFactor({ recoveryCode: code.trim() });
        closeSheet();
        void refreshSession();
        show('Two-factor authentication disabled', 'info');
      } catch (e2) {
        setError(parseApiError(e2).message || 'Could not disable two-factor');
      }
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      show('Recovery codes copied', 'info');
    } catch {
      show('Copy failed — select and copy the codes manually', 'error');
    }
  };

  return (
    <>
      <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
        <Icon
          name="shieldCheck"
          size={20}
          filled={enabled}
          className={enabled ? 'shrink-0 text-success-text' : 'shrink-0 text-text-secondary'}
        />
        <div className="min-w-0 flex-1">
          <p className="text-body-emphasis text-text-primary">Two-factor authentication</p>
          <p className="text-caption text-text-muted">
            {enabled ? 'On — authenticator code required at sign-in' : 'Add a code step to sign-in'}
          </p>
        </div>
        <Switch
          checked={enabled}
          onChange={(v) => {
            if (!isLive) {
              if (v) {
                setSheetOpen(true);
                setStep('key');
              } else {
                setEnabled(false);
                clearBackupCodes();
                show('Two-factor authentication disabled — recovery codes discarded', 'info');
              }
              return;
            }
            setStep(v ? 'key' : 'disable');
            if (v) {
              void openEnroll();
            } else {
              setSheetOpen(true);
            }
          }}
          aria-label="Two-factor authentication"
        />
      </div>

      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        title={
          step === 'disable'
            ? 'Disable two-factor'
            : step === 'codes'
              ? 'Save your recovery codes'
              : 'Set up two-factor'
        }
        maxWidth={440}
      >
        <div className="px-5 py-5">
          {step === 'key' && (
            <>
              <div className="flex items-start gap-3">
                <Icon name="shieldCheck" size={22} className="mt-0.5 shrink-0 text-text-secondary" />
                <p className="text-body text-text-secondary">
                  Add this key to your authenticator app (Google
                  Authenticator, 1Password, Authy…), then enter the 6-digit
                  code it generates.
                </p>
              </div>
              {error && !secret ? (
                <p className="mt-4 text-caption text-danger-text">{error}</p>
              ) : secret ? (
                <div className="mt-4 rounded-lg border border-border-subtle px-3 py-2.5">
                  <p className="text-label text-text-muted">Manual key</p>
                  <p className="mt-1 select-all break-all font-mono text-body-emphasis text-text-primary">
                    {secret}
                  </p>
                  {otpauthUrl ? (
                    <a
                      href={otpauthUrl}
                      className="pressable mt-1 inline-block text-caption font-semibold text-text-primary underline underline-offset-2"
                    >
                      Open in authenticator app
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-caption text-text-muted">Preparing a key…</p>
              )}
              <div className="mt-4">
                <AuthField
                  label="6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  error={error && secret ? error : undefined}
                />
              </div>
              <Button
                variant="primary"
                size="md"
                fullWidth
                className="mt-5"
                disabled={busy || !secret || code.trim().length < 6}
                onClick={() => void submitVerify()}
              >
                {busy ? 'Verifying…' : 'Verify and enable'}
              </Button>
            </>
          )}

          {step === 'codes' && (
            <>
              <p className="text-body text-text-secondary">
                Each code signs you in once if you can’t reach your
                authenticator. This is the only time they’re shown.
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-1.5">
                {recoveryCodes.map((c) => (
                  <li
                    key={c}
                    className="rounded-md bg-surface-alt px-2.5 py-1.5 text-center font-mono text-caption text-text-primary"
                  >
                    {c}
                  </li>
                ))}
              </ul>
              <Button
                variant="primary"
                size="md"
                fullWidth
                className="mt-5"
                onClick={() => void copyCodes()}
              >
                Copy codes
              </Button>
              <Button variant="quiet" size="md" fullWidth className="mt-2" onClick={closeSheet}>
                Done
              </Button>
            </>
          )}

          {step === 'disable' && (
            <>
              <p className="text-body text-text-secondary">
                Enter your current authenticator code — or a recovery code —
                to turn two-factor off.
              </p>
              <div className="mt-4">
                <AuthField
                  label="Code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  error={error ?? undefined}
                />
              </div>
              <Button
                variant="danger"
                size="md"
                fullWidth
                className="mt-5"
                disabled={busy || code.trim().length < 4}
                onClick={() => void submitDisable()}
              >
                {busy ? 'Disabling…' : 'Disable two-factor'}
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
