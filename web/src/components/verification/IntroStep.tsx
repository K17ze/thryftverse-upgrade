'use client';

/**
 * IntroStep — why verify, what it unlocks, and the fixture-mode honesty
 * line before the user invests effort. One dominant explanation, three
 * hairline unlock rows, a single primary action.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { VERIFICATION_UNLOCKS } from './verificationModel';
import { VerificationNote } from './VerificationNote';

interface IntroStepProps {
  onStart: () => void;
  onDismiss: () => void;
}

export function IntroStep({ onStart, onDismiss }: IntroStepProps) {
  return (
    <div>
      <p className="max-w-md text-body-large text-text-secondary">
        Confirm who you are to build trust with buyers and unlock selling
        features across ThryftVerse.
      </p>

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
        Your legal name, date of birth and address, plus a photo of a
        passport, driving licence or national ID card.
      </p>

      <VerificationNote icon="info">
        Demo check — this preview doesn&apos;t run a real identity
        verification and nothing you enter is uploaded or stored anywhere
        beyond this browser.
      </VerificationNote>

      <div className="mt-8">
        <Button variant="primary" size="lg" fullWidth icon="shieldCheck" onClick={onStart}>
          Start verification
        </Button>
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={onDismiss}
            className="pressable rounded-md px-3 py-2 text-body font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
