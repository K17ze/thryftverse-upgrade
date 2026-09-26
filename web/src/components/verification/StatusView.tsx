'use client';

/**
 * StatusView — the verification hub. Renders the three outcome states the
 * mobile VerificationStatusScreen covers: in_review (with the simulated
 * review tick), approved (what the tier unlocks, both fixture-verified and
 * locally approved variants) and rejected with its reason.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { timeAgo } from '@/lib/utils/format';
import { VERIFICATION_UNLOCKS, type VerificationStatus } from './verificationModel';

/** How long the simulated review takes before the approval tick lands. */
const REVIEW_SIMULATION_MS = 4500;

interface StatusViewProps {
  status: VerificationStatus;
  submittedAt: string | null;
  rejectionReason: string | null;
  /** True when the account was already ID verified outside this flow. */
  alreadyVerified: boolean;
  onCompleteReview: () => void;
  onDecline: (reason: string) => void;
  /** Rejected → restart the flow with the last details prefilled. */
  onRetry: () => void;
  /** Approved → run the flow again as a demo. */
  onRunAgain: () => void;
}

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

interface TimelineRow {
  label: string;
  detail: string;
  state: 'complete' | 'active';
}

function Timeline({ rows }: { rows: TimelineRow[] }) {
  return (
    <ul className="mt-8 w-full border-y border-border-subtle text-left">
      {rows.map((row) => (
        <li
          key={row.label}
          className="flex items-center gap-3 border-b border-border-subtle px-1 py-3.5 last:border-b-0"
        >
          {row.state === 'complete' ? (
            <Icon name="check" filled size={18} className="shrink-0 text-success-text" />
          ) : (
            <span className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-warning" aria-hidden />
          )}
          <span className="flex-1 text-body-emphasis text-text-primary">{row.label}</span>
          <span
            className={`text-caption ${row.state === 'active' ? 'text-warning-text' : 'text-text-muted'}`}
          >
            {row.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

function UnlockList() {
  return (
    <>
      <p className="mt-8 w-full text-left text-caption font-medium uppercase tracking-wide text-text-muted">
        What it unlocks
      </p>
      <ul className="mt-2 w-full border-y border-border-subtle text-left">
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
        <li className="flex items-center gap-4 py-3.5">
          <Icon name="store" size={18} className="shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block text-body-emphasis font-medium text-text-secondary">
              Trusted Seller
            </span>
            <span className="block text-caption text-text-muted">
              Unlocks after ID verification plus payout history — not part of this check
            </span>
          </span>
        </li>
      </ul>
    </>
  );
}

export function StatusView({
  status,
  submittedAt,
  rejectionReason,
  alreadyVerified,
  onCompleteReview,
  onDecline,
  onRetry,
  onRunAgain,
}: StatusViewProps) {
  const router = useRouter();

  // Simulated review tick — fixture mode has no reviewer, so the pending
  // state resolves to approved after a beat. Honestly labelled in the copy.
  useEffect(() => {
    if (status !== 'in_review') return;
    const timer = window.setTimeout(onCompleteReview, REVIEW_SIMULATION_MS);
    return () => window.clearTimeout(timer);
  }, [status, onCompleteReview]);

  if (status === 'in_review') {
    return (
      <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
        <StatusIcon icon="clock" tone="warning" />
        <h2 className="mt-5 text-section-title font-semibold text-text-primary">
          Checking your details
        </h2>
        <p className="mt-1.5 max-w-sm text-body text-text-secondary">
          We&apos;re reviewing your submission.
          {submittedAt ? ` Sent ${timeAgo(submittedAt).toLowerCase()}.` : ''}
        </p>

        <Timeline
          rows={[
            { label: 'Email confirmed', detail: 'Verified', state: 'complete' },
            { label: 'Identity details', detail: 'Received', state: 'complete' },
            { label: 'Document photo', detail: 'Received', state: 'complete' },
            { label: 'Review', detail: 'In progress', state: 'active' },
          ]}
        />

        <p className="mt-4 max-w-sm text-caption text-text-muted">
          Simulated review — this preview approves automatically in a few
          seconds; no real check runs.
        </p>
        <button
          type="button"
          onClick={() =>
            onDecline(
              'The document photo wasn’t readable — upload a sharper image with all four corners visible.',
            )
          }
          className="pressable mt-2 rounded-md px-3 py-2 text-caption font-medium text-text-muted underline-offset-4 transition-colors hover:text-text-secondary hover:underline"
        >
          Preview a declined outcome instead
        </button>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
        <StatusIcon icon="closeCircle" tone="danger" />
        <h2 className="mt-5 text-section-title font-semibold text-text-primary">
          Verification wasn&apos;t approved
        </h2>
        <p className="mt-1.5 max-w-sm text-body text-text-secondary">
          {rejectionReason ?? 'We couldn’t confirm your identity this time.'}
        </p>

        <div className="mt-8 flex w-full flex-col gap-2.5">
          <Button variant="primary" size="md" fullWidth onClick={onRetry}>
            Try again
          </Button>
          <Button variant="secondary" size="md" fullWidth onClick={() => router.push('/support')}>
            Contact support
          </Button>
        </div>
      </div>
    );
  }

  // approved — the only other status that reaches this view
  return (
    <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
      <StatusIcon icon="verified" tone="success" />
      <h2 className="mt-5 text-section-title font-semibold text-text-primary">Identity verified</h2>
      <p className="mt-1.5 max-w-sm text-body text-text-secondary">
        {alreadyVerified
          ? 'This account is already ID verified — the badge shows on your profile and listings.'
          : `Your details were approved${submittedAt ? ` ${timeAgo(submittedAt).toLowerCase()}` : ''}. Simulated check — no real verification ran.`}
      </p>

      <UnlockList />

      <div className="mt-8 flex w-full flex-col gap-2.5">
        <Button
          variant="primary"
          size="md"
          fullWidth
          icon="profile"
          onClick={() => router.push('/profile')}
        >
          View your profile
        </Button>
        <Button variant="secondary" size="md" fullWidth onClick={() => router.push('/settings')}>
          Back to settings
        </Button>
      </div>
      <button
        type="button"
        onClick={onRunAgain}
        className="pressable mt-4 rounded-md px-3 py-2 text-caption font-medium text-text-muted underline-offset-4 transition-colors hover:text-text-secondary hover:underline"
      >
        Run the verification flow again
      </button>
    </div>
  );
}
