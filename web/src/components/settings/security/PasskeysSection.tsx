'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as securityService from '@/lib/api/services/security';

const isLive = DATA_MODE === 'live';

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function PasskeysSection() {
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
        // Real ceremony: server options → browser authenticator → server verify
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
