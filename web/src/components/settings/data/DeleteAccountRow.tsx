'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsRow } from '../SettingsRow';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { AuthField } from '@/components/auth/AuthField';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as usersService from '@/lib/api/services/users';

const isLive = DATA_MODE === 'live';
const DELETE_PHRASE = 'DELETE';

function clearPersistedStores() {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith('thryftverse.')) keys.push(key);
  }
  for (const key of keys) window.localStorage.removeItem(key);
}

export function DeleteAccountRow() {
  const router = useRouter();
  const { signOut, isGuest, accountIdentity } = useSession();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totpRequested, setTotpRequested] = useState(false);

  const requiresTotp = accountIdentity?.twoFactorEnabled === true || totpRequested;
  const phraseOk = typed.trim().toUpperCase() === DELETE_PHRASE;
  const ready = phraseOk && (!isLive || !requiresTotp || totpCode.trim().length >= 6);

  const resetSheet = () => {
    setTyped('');
    setPassword('');
    setTotpCode('');
    setError(null);
    setTotpRequested(false);
    setSubmitting(false);
  };

  const confirmDelete = async () => {
    if (!isLive) {
      clearPersistedStores();
      setOpen(false);
      resetSheet();
      signOut();
      show('Local preview data cleared — signed out', 'info');
      router.push('/auth');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await usersService.deleteMyAccount({
        confirmPhrase: DELETE_PHRASE,
        password: password || undefined,
        totpCode: totpCode.trim() || undefined,
      });
      clearPersistedStores();
      setOpen(false);
      resetSheet();
      signOut();
      show('Account deleted', 'info');
      router.push('/auth');
    } catch (e) {
      const parsed = parseApiError(e);
      setError(parsed.message || 'Could not delete the account');
      if (parsed.message?.toLowerCase().includes('two-factor')) setTotpRequested(true);
      setSubmitting(false);
    }
  };

  return (
    <>
      <SettingsRow
        icon="trash"
        label="Delete account"
        danger
        onClick={() => setOpen(true)}
      />

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          resetSheet();
        }}
        title="Delete account"
        maxWidth={440}
      >
        <div className="px-5 py-5">
          {isLive && isGuest ? (
            <>
              <p className="text-body text-text-secondary">
                Account deletion belongs to a signed-in account — sign in
                to continue.
              </p>
              <Button
                variant="primary"
                size="md"
                fullWidth
                className="mt-4"
                onClick={() => {
                  setOpen(false);
                  router.push('/auth/login');
                }}
              >
                Sign in
              </Button>
              <Button
                variant="quiet"
                size="md"
                fullWidth
                className="mt-2"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-3 text-body text-text-secondary">
                {isLive ? (
                  <p>
                    Deleting your account removes your profile, listings,
                    orders, messages and saved items — permanently. The
                    platform anonymises your personal data and every session
                    is signed out. This can’t be undone.
                  </p>
                ) : (
                  <p>
                    In this preview the account is demo data — deleting it
                    removes this device’s local preview data (every
                    ThryftVerse preference and store held here) and signs
                    you out. Nothing is erased on a server.
                  </p>
                )}
              </div>

              {isLive ? (
                <div className="mt-5 space-y-4">
                  <AuthField
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {requiresTotp ? (
                    <AuthField
                      label="Two-factor code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                    />
                  ) : null}
                </div>
              ) : null}

              <label
                htmlFor="delete-confirm"
                className="mt-5 block text-caption font-medium text-text-secondary"
              >
                Type {DELETE_PHRASE} to confirm
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={DELETE_PHRASE}
                autoComplete="off"
                className="mt-2 h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
              />

              {error ? (
                <p role="alert" className="mt-3 text-caption text-danger-text">
                  {error}
                </p>
              ) : null}

              <Button
                variant="danger"
                size="md"
                fullWidth
                className="mt-4"
                disabled={!ready || submitting}
                onClick={() => void confirmDelete()}
              >
                {submitting
                  ? 'Deleting…'
                  : isLive
                    ? 'Verify and delete my account'
                    : 'Delete my account permanently'}
              </Button>
              <Button
                variant="quiet"
                size="md"
                fullWidth
                className="mt-2"
                disabled={submitting}
                onClick={() => {
                  setOpen(false);
                  resetSheet();
                }}
              >
                Keep my account
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
