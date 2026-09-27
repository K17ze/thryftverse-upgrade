'use client';

/**
 * SecurityView — the /settings/security surface.
 *
 * Web deepening of the mobile ChangePasswordScreen, AccountSecurityScreen
 * and the passkey section of passkeyApi:
 * - Change-password form with the mobile PasswordStrengthBar scoring
 *   (4 requirements → weak/fair/good/strong); a successful change stamps
 *   `passwordUpdatedAt` so the state persists like a real mutation.
 * - Active sessions: the shared fixture list minus persisted revocations —
 *   revoke survives reload exactly as a server write would, with the same
 *   confirm + toast-undo grammar as orders.
 * - Two-factor switch: fixture-grade flow — enabling issues real recovery
 *   codes on this device; the sheet is honest that no authenticator
 *   handshake exists in this build.
 * - Passkeys: real WebAuthn registration on this device's authenticator.
 * - Link rows to the deeper surfaces: recovery codes, connected accounts,
 *   account control.
 */

import { useState } from 'react';
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
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useSession } from '@/lib/session/SessionProvider';
import {
  SECURITY_SESSIONS,
  formatSessionActivity,
} from '@/lib/data/fixtures-settings';
import type { SecuritySession } from '@/lib/contracts/settings';

// ── Change password ─────────────────────────────────────────────────────────

function ChangePasswordForm() {
  const { show } = useToast();
  const hydrated = useHydrated();
  const passwordUpdatedAt = useSettingsPrefs((s) => s.passwordUpdatedAt);
  const markPasswordUpdated = useSettingsPrefs((s) => s.markPasswordUpdated);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsCurrent = next.length > 0 && current.length > 0 && next === current;
  const valid =
    current.length >= MIN_PASSWORD_LENGTH &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm &&
    !mismatch &&
    !sameAsCurrent;

  const submit = () => {
    markPasswordUpdated();
    setCurrent('');
    setNext('');
    setConfirm('');
    show('Password updated', 'success');
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
        disabled={!valid}
        onClick={submit}
      >
        Update password
      </Button>
      <p className="mt-3 text-caption text-text-muted">
        {hydrated && passwordUpdatedAt
          ? `Last changed ${new Date(passwordUpdatedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })} on this device. `
          : ''}
        A production build re-verifies the current password and rotates the
        credential server-side.
      </p>
    </div>
  );
}

// ── Sessions ────────────────────────────────────────────────────────────────

function sessionIcon(platform: string): 'desktop' | 'phone' {
  return platform === 'iOS' || platform === 'Android' ? 'phone' : 'desktop';
}

function Sessions() {
  const { show } = useToast();
  const hydrated = useHydrated();
  const revokedIds = useSettingsPrefs((s) => s.revokedSessionIds);
  const revokeSession = useSettingsPrefs((s) => s.revokeSession);
  const restoreSession = useSettingsPrefs((s) => s.restoreSession);
  const revokeOtherSessions = useSettingsPrefs((s) => s.revokeOtherSessions);
  const restoreSessions = useSettingsPrefs((s) => s.restoreSessions);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);

  // Persisted revocations filter the fixture inventory — the surviving
  // list keeps the fixture's authored order.
  const sessions = hydrated
    ? SECURITY_SESSIONS.filter((s) => s.isCurrent || !revokedIds.includes(s.id))
    : SECURITY_SESSIONS;
  const others = sessions.filter((s) => !s.isCurrent);

  const requestRevoke = (s: SecuritySession) =>
    setConfirm({
      title: 'Sign out this session?',
      message: `${s.deviceName} will lose access on its next request and need to log in again.`,
      confirmLabel: 'Sign out',
      variant: 'destructive',
      onConfirm: () => {
        setConfirm(null);
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
        const ids = others.map((s) => s.id);
        revokeOtherSessions(ids);
        show('All other sessions signed out', 'info', {
          label: 'Undo',
          onPress: () => restoreSessions(ids),
        });
      },
    });

  if (!hydrated) {
    return (
      <div aria-busy aria-label="Loading sessions">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border-subtle">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
            <Icon name={sessionIcon(s.platform)} size={20} className="shrink-0 text-text-secondary" />
            <div className="min-w-0 flex-1">
              <p className="clamp-1 text-body-emphasis font-medium text-text-primary">
                {s.deviceName}
              </p>
              <p className="clamp-1 text-caption text-text-muted">
                {formatSessionActivity(s.lastSeenAt)}
                {s.ipAddress ? ` · ${s.ipAddress}` : ''}
              </p>
            </div>
            {s.isCurrent ? (
              <span className="rounded-full bg-success-subtle px-2 py-0.5 text-meta font-semibold text-success-text">
                Current
              </span>
            ) : (
              <button
                type="button"
                onClick={() => requestRevoke(s)}
                className="pressable -my-2 inline-flex min-h-11 items-center rounded-md px-2 text-caption font-semibold text-danger-text hover:bg-danger-subtle"
              >
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 ? (
        <div className="px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={requestRevokeOthers}
            className="pressable inline-flex min-h-11 items-center text-caption font-semibold text-danger-text"
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

function TwoFactorRow() {
  const { show } = useToast();
  const hydrated = useHydrated();
  const enabled = useSettingsPrefs((s) => s.twoFactorEnabled);
  const setEnabled = useSettingsPrefs((s) => s.setTwoFactorEnabled);
  const regenerateBackupCodes = useSettingsPrefs((s) => s.regenerateBackupCodes);
  const clearBackupCodes = useSettingsPrefs((s) => s.clearBackupCodes);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!hydrated) {
    return (
      <div aria-busy aria-label="Loading sign-in protection">
        <Skeleton className="h-[52px] w-full rounded-none" />
      </div>
    );
  }

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
            {enabled ? 'On — recovery codes issued on this device' : 'Add a code step to sign-in'}
          </p>
        </div>
        <Switch
          checked={enabled}
          onChange={(v) => {
            if (v) {
              setSheetOpen(true);
            } else {
              setEnabled(false);
              clearBackupCodes();
              show('Two-factor authentication disabled — recovery codes discarded', 'info');
            }
          }}
          aria-label="Two-factor authentication"
        />
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Set up two-factor" maxWidth={440}>
        <div className="px-5 py-5">
          <div className="flex items-start gap-3">
            <Icon name="shieldCheck" size={22} className="mt-0.5 shrink-0 text-text-secondary" />
            <p className="text-body text-text-secondary">
              In a production build this step shows a QR code for your
              authenticator app and verifies a 6-digit code. This build has no
              authenticator handshake — enabling turns the preference on for
              this device and issues a real set of recovery codes you can save.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            fullWidth
            className="mt-5"
            onClick={() => {
              regenerateBackupCodes();
              setEnabled(true);
              setSheetOpen(false);
              show('Two-factor enabled — save your recovery codes', 'success');
            }}
          >
            Enable two-factor
          </Button>
          <Button
            variant="quiet"
            size="md"
            fullWidth
            className="mt-2"
            onClick={() => setSheetOpen(false)}
          >
            Not now
          </Button>
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
  const passkeys = useSettingsPrefs((s) => s.passkeys);
  const addPasskey = useSettingsPrefs((s) => s.addPasskey);
  const removePasskey = useSettingsPrefs((s) => s.removePasskey);
  const [registering, setRegistering] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);

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
        removePasskey(credentialId);
        show('Passkey removed', 'info');
      },
    });

  if (!hydrated) {
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

  return (
    <>
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
            className="pressable -my-2 inline-flex min-h-11 items-center rounded-md px-2 text-caption font-semibold text-danger-text hover:bg-danger-subtle"
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
          Uses this device’s screen lock — fingerprint, face or PIN. The
          credential is created by your browser’s authenticator and recorded
          on this device; production also verifies it server-side at sign-in.
        </p>
      </div>

      <ConfirmSheet sheet={confirm} onDismiss={() => setConfirm(null)} />
    </>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export function SecurityView() {
  const hydrated = useHydrated();
  const twoFactorEnabled = useSettingsPrefs((s) => s.twoFactorEnabled);
  const backupCodes = useSettingsPrefs((s) => s.backupCodes);

  return (
    <>
      <SettingsSection title="Password">
        <ChangePasswordForm />
      </SettingsSection>

      <SettingsSection title="Sign-in protection">
        <TwoFactorRow />
        {hydrated && twoFactorEnabled ? (
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

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        Sessions and linked accounts come from this build’s account data;
        changes persist on this device. The platform revokes refresh tokens
        server-side — a signed-out session loses access on its next request.
      </p>
    </>
  );
}
