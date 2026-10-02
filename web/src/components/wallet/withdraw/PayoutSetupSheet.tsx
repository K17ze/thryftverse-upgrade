'use client';

/**
 * Payout setup sheet — live mode only. The backend stores a provider-side
 * payout reference, not raw bank details, so "add a payout method" is the
 * real Stripe Connect sequence (status → create account → onboarding
 * link handoff), mirroring mobile's usePayoutAccountConnection. The
 * onboarding URL opens as a user-clicked link (popup blockers would kill
 * a programmatic window.open after the awaited status calls); when the
 * user comes back, "Check status" re-runs the same sequence.
 */

import { useEffect, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { parseApiError } from '@/lib/api/http';
import type { PayoutSetupOutcome } from '@/lib/api/services/payouts';
import { useConnectStripePayout } from '@/lib/hooks/payout-queries';

interface PayoutSetupSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called when the sequence resolves to an active payout account. */
  onReady?: () => void;
}

type SheetState =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'onboarding'; onboardingUrl: string; checkedAgain: boolean }
  | { phase: 'error'; message: string };

export function PayoutSetupSheet({ open, onClose, onReady }: PayoutSetupSheetProps) {
  const connect = useConnectStripePayout();
  const [state, setState] = useState<SheetState>({ phase: 'idle' });

  // Reset each time the sheet opens — a stale error must not stick.
  useEffect(() => {
    if (open) setState({ phase: 'idle' });
  }, [open]);

  const run = async () => {
    setState({ phase: 'working' });
    try {
      const outcome: PayoutSetupOutcome = await connect.mutateAsync();
      if (outcome.kind === 'ready') {
        onReady?.();
        onClose();
        return;
      }
      setState((prev) => ({
        phase: 'onboarding',
        onboardingUrl: outcome.onboardingUrl,
        // True when this is the post-handoff re-check — Stripe hasn't
        // flipped payouts_enabled yet.
        checkedAgain: prev.phase === 'onboarding',
      }));
    } catch (error) {
      setState({
        phase: 'error',
        message: parseApiError(error, 'Unable to set up payouts right now.').message,
      });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Set up payouts" maxWidth={440}>
      <div className="px-5 py-5">
        {state.phase === 'working' ? (
          <div className="flex items-center gap-2.5 py-8" aria-busy role="status">
            <Spinner size={24} tone="neutral" />
            <p className="text-body text-text-secondary">
              Checking your payout setup…
            </p>
          </div>
        ) : state.phase === 'onboarding' ? (
          <>
            <p className="text-body text-text-secondary">
              {state.checkedAgain
                ? 'Stripe is still verifying your details — this can take a few minutes. Finish the onboarding in the Stripe tab, then check again.'
                : 'Finish setup on Stripe — it opens in a new tab. Come back here when you\u2019re done.'}
            </p>
            <a
              href={state.onboardingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pressable mt-5 flex h-12 w-full items-center justify-center gap-1.5 rounded-md bg-brand font-semibold text-text-inverse"
            >
              <Icon name="link" size={18} />
              Open Stripe onboarding
            </a>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              className="mt-2"
              onClick={() => void run()}
            >
              I&rsquo;ve finished — check status
            </Button>
          </>
        ) : (
          <>
            <p className="text-body text-text-secondary">
              Payouts are sent through Stripe Connect. You&rsquo;ll verify your identity
              and bank details on Stripe — ThryftVerse never stores them.
            </p>
            {state.phase === 'error' ? (
              <p className="mt-3 flex items-start gap-1.5 text-caption text-danger-text" role="alert">
                <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
                {state.message}
              </p>
            ) : null}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5"
              onClick={() => void run()}
            >
              {state.phase === 'error' ? 'Try again' : 'Continue to Stripe'}
            </Button>
            <p className="mt-4 flex items-start gap-1.5 text-caption text-text-muted">
              <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
              Your bank details go to Stripe directly — only the connected
              account reference is stored here.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
