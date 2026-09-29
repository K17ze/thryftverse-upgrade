'use client';

/**
 * SecurityView — the /settings/security surface.
 *
 * Web deepening of the mobile ChangePasswordScreen, AccountSecurityScreen
 * and the passkey section of passkeyApi. Live mode hits the same endpoints
 * mobile does — password rotation, session inventory + revocation, TOTP
 * enrolment and WebAuthn passkeys are all server-verified writes:
 * - Change password → POST /auth/password/change.
 * - Sessions → GET /account-security/sessions, DELETE /:id,
 *   POST /revoke-others. Revocation is a server write — no Undo toast.
 * - Two-factor → POST /auth/2fa/enroll (secret + otpauth), /verify
 *   (returns display-once recovery codes), /disable (requires a code).
 * - Passkeys → /auth/passkey/register/options → browser ceremony →
 *   /register/verify; list via GET /auth/passkeys; DELETE to remove.
 *
 * Fixture mode keeps the local persistence mirror (revocations and
 * relinks survive reload exactly as a server write would).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { AuthField } from '@/components/auth/AuthField';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { MIN_PASSWORD_LENGTH } from '@/components/auth/passwordPolicy';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import { changePassword } from '@/lib/api/services/auth';
import * as securityService from '@/lib/api/services/security';
import {
  SECURITY_SESSIONS,
  formatSessionActivity,
} from '@/lib/data/fixtures-settings';
import type { SecuritySession } from '@/lib/contracts/settings';

const isLive = DATA_MODE === 'live';

// ── Change password ─────────────────────────────────────────────────────────

function ChangePasswordForm() {
  const { show } = useToast();
  const { refreshSession } = useSession();
  const hydrated = useHydrated();
  const passwordUpdatedAt = useSettingsPrefs((s) => s.passwordUpdatedAt);
  const markPasswordUpdated = useSettingsPrefs((s) => s.markPasswordUpdated);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsCurrent = next.length > 0 && current.length > 0 && next === current;
  const valid =
    current.length >= MIN_PASSWORD_LENGTH &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm &&
    !mismatch &&
    !sameAsCurrent;

  const submit = async () => {
    setSubmitting(true);
    try {
      if (isLive) {
        // POST /auth/password/change — server re-verifies the current
        // password and rotates the credential; a wrong current password
        // comes back as an error the toast reports verbatim.
        await changePassword(current, next);
      }
      markPasswordUpdated();
      setCurrent('');
      setNext('');
      setConfirm('');
      show('Password updated', 'success');
      void refreshSession();
    } catch (error) {
      show(parseApiError(error).message || 'Could not update password', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="space-y-4">
        <AuthField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <div>
          <AuthField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={sameAsCurrent ? 'New password must differ from the current one' : undefined}
          />
          <PasswordStrength password={next} />
        </div>
        <AuthField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'Passwords don’t match' : undefined}
        />
      </div>
      <Button
        variant="primary"
        size="md"
        fullWidth
        className="mt-5"
        disabled={!valid || submitting}
        onClick={() => void submit()}
      >
        {submitting ? 'Updating…' : 'Update password'}
      </Button>
      {hydrated && passwordUpdatedAt ? (
        <p className="mt-3 text-caption text-text-muted">
          Last changed{' '}
          {new Date(passwordUpdatedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}{' '}
          on this device.
        </p>
      ) : null}
    </div>
  );
}

// ── Sessions ────────────────────────────────────────────────────────────────

function sessionIcon(platform: string): 'desktop' | 'phone' {
  return platform === 'iOS' || platform === 'Android' ? 'phone' : 'desktop';
}

function SessionRow({
  session,
  onRevoke,
  pending,
}: {
  session: SecuritySession;
  onRevoke: (s: SecuritySession) => void;
  pending: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
      <Icon name={sessionIcon(session.platform)} size={20} className="shrink-0 text-text-secondary" />
      <div className="min-w-0 flex-1">
        <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
          {session.deviceName}
        </p>
        <p className="clamp-1 text-caption text-text-muted">
          {formatSessionActivity(session.lastSeenAt)}
          {session.ipAddress ? ` · ${session.ipAddress}` : ''}
        </p>
      </div>
      {session.isCurrent ? (
        <span className="rounded-full bg-success-subtle px-2 py-0.5 text-meta font-semibold text-success-text">
          Current
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onRevoke(session)}
          disabled={pending}
          className="pressable -my-2 inline-flex min-h-11 items-center rounded-md px-2 text-caption font-semibold text-danger-text hover:bg-danger-subtle disabled:opacity-50"
        >
          Sign out
        </button>
      )}
    </li>
  );
}

function Sessions() {
  const { show } = useToast();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const revokedIds = useSettingsPrefs((s) => s.revokedSessionIds);
  const revokeSession = useSettingsPrefs((s) => s.revokeSession);
  const restoreSession = useSettingsPrefs((s) => s.restoreSession);
  const revokeOtherSessionsPref = useSettingsPrefs((s) => s.revokeOtherSessions);
  const restoreSessions = useSettingsPrefs((s) => s.restoreSessions);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);

  const liveSessions = useQuery({
    queryKey: ['security', 'sessions'],
    queryFn: ({ signal }) => securityService.fetchSecuritySessions(signal),
    enabled: isLive,
    staleTime: 15_000,
  });
  const liveRevoke = useMutation({
    mutationFn: (sessionId: string) => securityService.revokeSecuritySession(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['security', 'sessions'] });
      show('Session signed out', 'success');
    },
    onError: (error) =>
      show(parseApiError(error).message || 'Could not sign out that session', 'error'),
  });
  const liveRevokeOthers = useMutation({
    mutationFn: () => securityService.revokeOtherSecuritySessions(),
    onSuccess: ({ revokedCount }) => {
      void queryClient.invalidateQueries({ queryKey: ['security', 'sessions'] });
      show(
        revokedCount === 1
          ? 'Signed out 1 other session'
          : `Signed out ${revokedCount} other sessions`,
        'success',
      );
    },
    onError: (error) =>
      show(parseApiError(error).message || 'Could not sign out other sessions', 'error'),
  });

  // Fixture inventory minus persisted revocations — the surviving list
  // keeps the fixture's authored order. Live mode reads the server.
  const sessions = isLive
    ? (liveSessions.data ?? [])
    : hydrated
      ? SECURITY_SESSIONS.filter((s) => s.isCurrent || !revokedIds.includes(s.id))
      : SECURITY_SESSIONS;
  const others = sessions.filter((s) => !s.isCurrent);
  const pending = liveRevoke.isPending || liveRevokeOthers.isPending;

  const requestRevoke = (s: SecuritySession) =>
    setConfirm({
      title: 'Sign out this session?',
      message: `${s.deviceName} will lose access on its next request and need to log in again.`,
      confirmLabel: 'Sign out',
      variant: 'destructive',
      onConfirm: () => {
        setConfirm(null);
        if (isLive) {
          // Server-side revocation is terminal — no Undo affordance.
          liveRevoke.mutate(s.id);
          return;
        }
        revokeSession(s.id);
        show('Session signed out', 'info', {
          label: 'Undo',
          onPress: () => restoreSession(s.id),
        });
      },
    });

  const requestRevokeOthers = () =>
    setConfirm({
      title: `Sign out ${others.length} other session${others.length === 1 ? '' : 's'}?`,
      message: 'Every device except this one will be signed out and need to log in again.',
      confirmLabel: 'Sign out all',
      variant: 'destructive',
      onConfirm: () => {
        setConfirm(null);
        if (isLive) {
          liveRevokeOthers.mutate();
          return;
        }
        const ids = others.map((s) => s.id);
        revokeOtherSessionsPref(ids);
        show('All other sessions signed out', 'info', {
          label: 'Undo',
          onPress: () => restoreSessions(ids),
        });
      },
    });

  if (isLive ? liveSessions.isLoading : !hydrated) {
    return (
      <div aria-busy aria-label="Loading sessions">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  if (isLive && liveSessions.isError) {
    return (
      <div className="px-4 py-4 sm:px-5">
        <p className="text-body-emphasis text-text-primary">Sessions unavailable</p>
        <p className="mt-0.5 text-caption text-text-muted">
          {parseApiError(liveSessions.error).message ||
            'The session list could not be loaded.'}
        </p>
        <button
          type="button"
          onClick={() => void liveSessions.refetch()}
          className="pressable mt-2 inline-flex min-h-11 items-center text-caption font-semibold text-text-primary"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      {sessions.length === 0 ? (
        <div className="px-4 py-4 sm:px-5">
          <p className="text-caption text-text-muted">No sessions returned.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} onRevoke={requestRevoke} pending={pending} />
          ))}
        </ul>
      )}
      {others.length > 0 ? (
        <div className="px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={requestRevokeOthers}
            disabled={pending}
            className="pressable inline-flex min-h-11 items-center text-caption font-semibold text-danger-text disabled:opacity-50"
          >
            Sign out all other sessions
          </button>
        </div>
      ) : null}

      <ConfirmSheet sheet={confirm} onDismiss={() => setConfirm(null)} />
    </>
  );
}

// ── Two-factor ──────────────────────────────────────────────────────────────

/** Live enable flow: enroll → show the manual key → verify a code →
 *  display the one-time recovery codes. Disable asks for a code or a
 *  recovery code — the backend requires it. */
type TwoFactorStep = 'key' | 'codes' | 'disable';

function TwoFactorRow() {
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
      // A recovery code also satisfies the requirement — retry the same
      // input under that field name before surfacing the failure.
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

// ── Passkeys ────────────────────────────────────────────────────────────────

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function Passkeys() {
  const { show } = useToast();
  const { user } = useSession();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const fixturePasskeys = useSettingsPrefs((s) => s.passkeys);
  const addPasskey = useSettingsPrefs((s) => s.addPasskey);
  const removePasskeyPref = useSettingsPrefs((s) => s.removePasskey);
  const [registering, setRegistering] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);

  const livePasskeys = useQuery({
    queryKey: ['security', 'passkeys'],
    queryFn: ({ signal }) => securityService.listPasskeys(signal),
    enabled: isLive && !!user,
    staleTime: 15_000,
  });
  const liveRemove = useMutation({
    mutationFn: (credentialId: string) => securityService.removePasskey(credentialId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['security', 'passkeys'] });
      show('Passkey removed', 'success');
    },
    onError: (error) =>
      show(parseApiError(error).message || 'Could not remove that passkey', 'error'),
  });

  const webAuthnAvailable =
    typeof window !== 'undefined' &&
    'PublicKeyCredential' in window &&
    typeof navigator !== 'undefined' &&
    !!navigator.credentials?.create;

  const register = async () => {
    if (!user) {
      show('Sign in to add a passkey', 'info');
      return;
    }
    setRegistering(true);
    try {
      if (isLive) {
        // Real ceremony: server options → browser authenticator → server
        // verify. The credential is only valid once the backend attests it.
        await securityService.registerPasskey('This device');
        void queryClient.invalidateQueries({ queryKey: ['security', 'passkeys'] });
        show('Passkey added to your account', 'success');
        return;
      }
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(user.id).slice(0, 32);
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'ThryftVerse' },
          user: {
            id: userId,
            name: user.username ?? 'thryftverse-member',
            displayName: user.username ?? 'ThryftVerse member',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { userVerification: 'preferred' },
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      if (!credential) {
        show('Passkey setup was cancelled', 'info');
        return;
      }
      addPasskey({
        credentialId: toBase64Url(credential.rawId),
        name: 'This device',
        deviceType: 'platform',
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      });
      show('Passkey added on this device', 'success');
    } catch {
      // NotAllowedError = cancelled or timed out; anything else = the
      // authenticator refused. Either way the honest read is the same.
      show('Passkey setup didn’t complete — nothing was added', 'info');
    } finally {
      setRegistering(false);
    }
  };

  const requestRemove = (credentialId: string) =>
    setConfirm({
      title: 'Remove passkey?',
      message: 'You’ll need another sign-in method — like your password — to get back in.',
      confirmLabel: 'Remove',
      variant: 'destructive',
      onConfirm: () => {
        setConfirm(null);
        if (isLive) {
          liveRemove.mutate(credentialId);
          return;
        }
        removePasskeyPref(credentialId);
        show('Passkey removed', 'info');
      },
    });

  if (isLive ? livePasskeys.isLoading : !hydrated) {
    return <Skeleton className="h-[52px] w-full rounded-none" />;
  }

  if (!webAuthnAvailable) {
    return (
      <div className="px-4 py-3.5 sm:px-5">
        <p className="text-body-emphasis text-text-primary">Passkeys</p>
        <p className="mt-0.5 text-caption text-text-muted">
          Not supported by this browser — passkeys need WebAuthn. Try a current
          version of Chrome, Edge or Safari.
        </p>
      </div>
    );
  }

  const passkeys = isLive ? (livePasskeys.data ?? []) : fixturePasskeys;

  return (
    <>
      {isLive && livePasskeys.isError ? (
        <div className="px-4 py-3 sm:px-5">
          <p className="text-caption text-text-muted">
            {parseApiError(livePasskeys.error).message || 'Passkeys could not be loaded.'}
          </p>
          <button
            type="button"
            onClick={() => void livePasskeys.refetch()}
            className="pressable mt-1 inline-flex min-h-11 items-center text-caption font-semibold text-text-primary"
          >
            Try again
          </button>
        </div>
      ) : null}
      {passkeys.map((p) => (
        <div key={p.credentialId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Icon name="fingerprint" size={20} className="shrink-0 text-text-secondary" />
          <div className="min-w-0 flex-1">
            <p className="clamp-1 text-body-emphasis text-text-primary">{p.name ?? 'Passkey'}</p>
            <p className="text-caption text-text-muted">
              Added{' '}
              {new Date(p.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => requestRemove(p.credentialId)}
            disabled={liveRemove.isPending}
            className="pressable -my-2 inline-flex min-h-11 items-center rounded-md px-2 text-caption font-semibold text-danger-text hover:bg-danger-subtle disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => void register()}
          disabled={registering}
          className="pressable inline-flex min-h-11 items-center text-caption font-semibold text-text-primary disabled:opacity-50"
        >
          {registering ? 'Waiting for your device…' : 'Add a passkey'}
        </button>
        <p className="mt-1 text-caption text-text-muted">
          Uses this device’s screen lock — fingerprint, face or PIN.
          {!isLive &&
            ' The credential is created by your browser’s authenticator and recorded on this device; production also verifies it server-side at sign-in.'}
        </p>
      </div>

      <ConfirmSheet sheet={confirm} onDismiss={() => setConfirm(null)} />
    </>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export function SecurityView() {
  const hydrated = useHydrated();
  const router = useRouter();
  const { isGuest, sessionLoading } = useSession();
  const twoFactorEnabled = useSettingsPrefs((s) => s.twoFactorEnabled);
  const backupCodes = useSettingsPrefs((s) => s.backupCodes);

  // Every mutable section requires auth — a live guest gets one honest
  // gate rather than five surfaces that 401 under the hood.
  if (isLive && (isGuest || sessionLoading)) {
    return (
      <EmptyState
        icon="lock"
        title="Sign in to manage security"
        subtitle="Passwords, sessions, two-factor and passkeys belong to your account — sign in to see and change them."
        actionLabel="Sign in"
        onAction={() => router.push('/auth/login')}
      />
    );
  }

  return (
    <>
      <SettingsSection title="Password">
        <ChangePasswordForm />
      </SettingsSection>

      <SettingsSection title="Sign-in protection">
        <TwoFactorRow />
        {!isLive && hydrated && twoFactorEnabled ? (
          <SettingsRow
            icon="lockOpen"
            label="Recovery codes"
            subtitle="One-time codes for when you can’t reach your authenticator"
            value={backupCodes ? `${backupCodes.length} left` : undefined}
            href="/settings/security/recovery"
          />
        ) : null}
      </SettingsSection>

      <SettingsSection title="Passkeys">
        <Passkeys />
      </SettingsSection>

      <SettingsSection title="Sessions">
        <Sessions />
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRow
          icon="link"
          label="Connected accounts"
          subtitle="Google, Apple and Facebook sign-in"
          href="/settings/security/connected"
        />
        <SettingsRow
          icon="settings"
          label="Account control"
          subtitle="Data export, deactivation and deletion"
          href="/settings/security/control"
        />
      </SettingsSection>

      {!isLive ? (
        <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
          Sessions and linked accounts come from this build’s account data;
          changes persist on this device. The platform revokes refresh tokens
          server-side — a signed-out session loses access on its next request.
        </p>
      ) : null}
    </>
  );
}
