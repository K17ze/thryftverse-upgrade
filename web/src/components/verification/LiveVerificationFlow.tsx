'use client';

/**
 * LiveVerificationFlow — the real KYC path for DATA_MODE=live, mirroring
 * the mobile VerificationStatusScreen → complianceApi contract:
 *
 *   status  ← GET /compliance/kyc-status/:userId   (the only truth source)
 *   start   → POST /compliance/kyc-session         → redirect to the
 *             provider-hosted capture page (document + liveness run on the
 *             vendor's page — ThryftVerse never handles the media)
 *
 * There is no simulated review: 'pending' stays pending until the
 * provider's webhook resolves it, and no local flag can mint the
 * identityVerified badge.
 */

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { parseApiError } from '@/lib/api/http';
import { useSession } from '@/lib/session/SessionProvider';
import * as verificationService from '@/lib/api/services/verification';
import {
  dobError,
  formatDobInput,
  parseDob,
  VERIFICATION_UNLOCKS,
} from './verificationModel';
import { VerificationNote } from './VerificationNote';

const FIELD_LABEL = 'text-label text-text-secondary';
const INPUT =
  'h-12 w-full rounded-lg border border-border bg-input px-4 text-body text-input-text outline-none placeholder:text-text-muted focus:border-text-muted';

function StatusIcon({ icon, tone }: { icon: AppIconName; tone: 'warning' | 'success' | 'danger' }) {
  const tones = {
    warning: 'bg-warning-subtle text-warning-text',
    success: 'bg-success-subtle text-success-text',
    danger: 'bg-danger-subtle text-danger-text',
  } as const;
  return (
    <span
      aria-hidden
      className={`flex h-16 w-16 items-center justify-center rounded-full ${tones[tone]}`}
    >
      <Icon name={icon} size={30} filled={tone !== 'warning'} />
    </span>
  );
}

function Skeleton() {
  return (
    <div aria-hidden className="pt-2">
      <div className="skeleton h-6 w-2/3 rounded-md" />
      <div className="mt-7 space-y-3">
        <div className="skeleton h-16 w-full rounded-lg" />
        <div className="skeleton h-16 w-full rounded-lg" />
      </div>
      <div className="skeleton mt-8 h-[52px] w-full rounded-md" />
    </div>
  );
}

export function LiveVerificationFlow({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { refreshSession } = useSession();
  const [step, setStep] = useState<'status' | 'details'>('status');
  const [legalName, setLegalName] = useState('');
  const [dob, setDob] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['kyc-status', userId],
    queryFn: ({ signal }) => verificationService.fetchKycStatus(userId, signal),
  });
  const status = statusQuery.data?.status ?? 'not_started';

  // A backend-side approval lands between renders — re-pull /users/me once
  // so the badge/profile truth follows the provider's verdict.
  useEffect(() => {
    if (status === 'verified') void refreshSession();
  }, [status, refreshSession]);

  const start = async () => {
    const name = legalName.trim();
    const dobErr = dobError(dob);
    if (name.length < 3) {
      setFieldError('Enter your name exactly as shown on your ID');
      return;
    }
    if (dobErr) {
      setFieldError(dobErr);
      return;
    }
    const dobIso = parseDob(dob)!.toISOString().slice(0, 10);
    setFieldError(null);
    setSubmitError(null);
    setStarting(true);
    try {
      const session = await verificationService.createKycSession({
        legalName: name,
        dateOfBirth: dobIso,
      });
      qc.invalidateQueries({ queryKey: ['kyc-status', userId] });
      if (session.verificationUrl) {
        window.location.assign(session.verificationUrl);
        return;
      }
      // Session exists but the provider returned no hosted URL — the case
      // is pending server-side; drop back to the status panel.
      setStep('status');
    } catch (error) {
      setSubmitError(
        parseApiError(error, 'Verification could not be started').message,
      );
    } finally {
      setStarting(false);
    }
  };

  if (statusQuery.isLoading) return <Skeleton />;

  if (status === 'verified') {
    return (
      <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
        <StatusIcon icon="verified" tone="success" />
        <h2 className="mt-5 text-section-title font-semibold text-text-primary">Identity verified</h2>
        <p className="mt-1.5 max-w-sm text-body text-text-secondary">
          This account is ID verified — the badge shows on your profile and listings.
        </p>
        <ul className="mt-8 w-full border-y border-border-subtle text-left">
          {VERIFICATION_UNLOCKS.map((u) => (
            <li
              key={u.title}
              className="flex items-center gap-4 border-b border-border-subtle py-3.5 last:border-b-0"
            >
              <Icon name={u.icon} size={18} className="shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1">
                <span className="block text-body-emphasis font-medium text-text-primary">{u.title}</span>
                <span className="block text-caption text-text-muted">{u.detail}</span>
              </span>
              <Icon name="check" size={16} className="shrink-0 text-success-text" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
        <StatusIcon icon="clock" tone="warning" />
        <h2 className="mt-5 text-section-title font-semibold text-text-primary">
          Verification in progress
        </h2>
        <p className="mt-1.5 max-w-sm text-body text-text-secondary">
          Your details are with our identity provider. This updates as soon as
          their check completes — no need to resubmit.
        </p>
        <div className="mt-8 flex w-full flex-col gap-2.5">
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => statusQuery.refetch()}
          >
            Check status
          </Button>
        </div>
      </div>
    );
  }

  // not_started / rejected / expired — the start form. rejected and expired
  // get their own headline; all three land on the same provider session.
  const rejected = status === 'rejected' || status === 'expired';

  if (step === 'details') {
    return (
      <div className="flex flex-col gap-6 pt-2">
        <fieldset className="flex flex-col gap-2">
          <label htmlFor="kyc-legal-name" className={FIELD_LABEL}>
            Legal full name
          </label>
          <input
            id="kyc-legal-name"
            value={legalName}
            onChange={(e) => {
              setLegalName(e.target.value);
              setFieldError(null);
            }}
            autoComplete="name"
            placeholder="As shown on your ID"
            className={INPUT}
          />
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <label htmlFor="kyc-dob" className={FIELD_LABEL}>
            Date of birth
          </label>
          <input
            id="kyc-dob"
            value={dob}
            onChange={(e) => {
              setDob(formatDobInput(e.target.value));
              setFieldError(null);
            }}
            inputMode="numeric"
            autoComplete="bday"
            placeholder="DD/MM/YYYY"
            className={INPUT}
          />
        </fieldset>
        {fieldError ? (
          <p role="alert" className="text-caption text-danger-text">{fieldError}</p>
        ) : null}

        <VerificationNote icon="shieldCheck">
          Document and face capture happen on our verification provider&apos;s
          secure page — your ID photo is never stored on ThryftVerse.
        </VerificationNote>

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={starting}
            onClick={() => void start()}
          >
            {starting ? 'Starting…' : 'Continue to verification'}
          </Button>
          {submitError ? (
            <p role="alert" className="text-caption text-danger-text">{submitError}</p>
          ) : null}
          <Button variant="quiet" size="md" fullWidth onClick={() => setStep('status')}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {rejected ? (
        <div className="mb-6 flex flex-col items-center py-4 text-center" aria-live="polite">
          <StatusIcon icon="closeCircle" tone="danger" />
          <h2 className="mt-5 text-section-title font-semibold text-text-primary">
            {status === 'expired' ? 'Verification expired' : 'Verification wasn’t approved'}
          </h2>
          <p className="mt-1.5 max-w-sm text-body text-text-secondary">
            {status === 'expired'
              ? 'The verification session lapsed before it was completed — start a fresh one.'
              : 'We couldn’t confirm your identity this time — you can run it again.'}
          </p>
        </div>
      ) : (
        <p className="max-w-md text-body-large text-text-secondary">
          Confirm who you are to build trust with buyers and unlock selling
          features across ThryftVerse.
        </p>
      )}

      <ul className="mt-7 border-y border-border-subtle">
        {VERIFICATION_UNLOCKS.map((u) => (
          <li key={u.title} className="flex items-center gap-4 border-b border-border-subtle py-4 last:border-b-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-text-primary">
              <Icon name={u.icon} size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-body-emphasis font-medium text-text-primary">{u.title}</span>
              <span className="block text-caption text-text-muted">{u.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-caption font-medium uppercase tracking-wide text-text-muted">
        What you&apos;ll need
      </p>
      <p className="mt-1.5 text-body text-text-secondary">
        Your legal name and date of birth, plus a passport, driving licence or
        national ID — captured securely by our verification provider.
      </p>

      <div className="mt-8">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon="shieldCheck"
          onClick={() => setStep('details')}
        >
          Start verification
        </Button>
      </div>
    </div>
  );
}
