'use client';

/**
 * WithdrawDestinationsSection — payout destination selector.
 * Renders verified bank accounts and Stripe Connect payout rails,
 * status badges, and setup/add actions.
 */

import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import {
  DESTINATION_STATUS_CONFIG,
  PAYOUT_GATE_COPY,
  type PayoutDestination,
} from './withdrawViewModel';

interface WithdrawDestinationsSectionProps {
  destinations: PayoutDestination[];
  selectedId: string | null;
  policyHint: string | null;
  payoutsError: boolean;
  isLive: boolean;
  payoutAvailability: string;
  connectStatus: { requirementsCurrentlyDue?: string[] } | null | undefined;
  onSelectDestination: (id: string) => void;
  onOpenAddFlow: () => void;
  onRefetchPayouts: () => void;
}

export function WithdrawDestinationsSection({
  destinations,
  selectedId,
  policyHint,
  payoutsError,
  isLive,
  payoutAvailability,
  connectStatus,
  onSelectDestination,
  onOpenAddFlow,
  onRefetchPayouts,
}: WithdrawDestinationsSectionProps) {
  return (
    <section aria-label="Payout destination" className="mt-10 px-4 sm:px-6">
      <h2 className="text-label text-text-muted">
        Transfer to
      </h2>
      {policyHint ? (
        <p className="mt-1 text-caption text-text-muted">{policyHint}</p>
      ) : null}

      {payoutsError ? (
        <div className="mt-3 rounded-lg border border-border-subtle px-4 py-4">
          <p className="text-body text-text-secondary">
            Your payout methods couldn&rsquo;t be loaded.
          </p>
          <button
            type="button"
            onClick={onRefetchPayouts}
            className="pressable mt-2 text-body-emphasis font-medium text-brand"
          >
            Try again
          </button>
        </div>
      ) : destinations.length === 0 ? (
        isLive && payoutAvailability === 'country_unsupported' ? (
          <div className="mt-3 rounded-lg border border-border-subtle px-4 py-4">
            <p className="text-body-emphasis font-medium text-text-primary">
              {PAYOUT_GATE_COPY.countryUnsupportedTitle}
            </p>
            <p className="mt-1 text-caption text-text-muted">
              {PAYOUT_GATE_COPY.countryUnsupportedSubtitle}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenAddFlow}
            className="pressable mt-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-4 py-4 text-left hover:border-brand"
          >
            <Icon name="plus" size={20} className="text-brand" />
            <span className="flex-1">
              <span className="block text-body-emphasis font-medium text-text-primary">
                {isLive
                  ? payoutAvailability === 'onboarding_required'
                    ? PAYOUT_GATE_COPY.finishSetupTitle
                    : 'Set up payouts'
                  : 'Add a bank account'}
              </span>
              <span className="block text-caption text-text-muted">
                {isLive
                  ? payoutAvailability === 'onboarding_required'
                    ? connectStatus?.requirementsCurrentlyDue?.length
                      ? PAYOUT_GATE_COPY.requirementsDueSubtitle
                      : PAYOUT_GATE_COPY.finishSetupSubtitle
                    : 'Required to withdraw — verify with Stripe'
                  : 'Required to withdraw — sort code + account number'}
              </span>
            </span>
            <Icon name="forward" size={16} className="text-text-muted" />
          </button>
        )
      ) : (
        <ul role="radiogroup" aria-label="Payout destination" className="mt-1">
          {destinations.map((d) => {
            const selectable = d.status === 'active';
            const checked = d.id === selectedId;
            return (
              <li key={d.id} className="border-b border-border-subtle">
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={!selectable}
                  onClick={() => selectable && onSelectDestination(d.id)}
                  className={`pressable flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left ${
                    selectable ? '' : 'opacity-60'
                  }`}
                >
                  <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
                    <Icon name="store" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="clamp-1 block text-body-emphasis text-text-primary">
                      {d.title}
                    </span>
                    <span className="clamp-1 block text-caption text-text-muted">
                      {d.subtitle}
                      {d.isDefault ? ' · Default' : ''}
                    </span>
                  </span>
                  {selectable ? (
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        checked ? 'border-brand bg-brand' : 'border-border'
                      }`}
                    >
                      {checked ? (
                        <Icon name="check" size={12} className="text-text-inverse" />
                      ) : null}
                    </span>
                  ) : (
                    <Badge variant={DESTINATION_STATUS_CONFIG[d.status].badge}>
                      {DESTINATION_STATUS_CONFIG[d.status].label}
                    </Badge>
                  )}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={onOpenAddFlow}
              className="pressable flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left"
            >
              <span className="flex h-11 w-9 shrink-0 items-center text-brand">
                <Icon name="plus" size={18} />
              </span>
              <span className="flex-1 text-body-emphasis text-brand">
                {isLive ? 'Set up another payout method' : 'Add bank account'}
              </span>
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}
