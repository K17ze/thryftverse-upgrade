'use client';

/**
 * SmartSellCard — per-listing auto-negotiation policy surface (mobile
 * SmartSellCard parity). Desktop grammar: a compact flat settings block on
 * the manage-listing rail — hairlines and type, not a modal. One mental
 * model: minimum payout after fees.
 *
 * Truth posture:
 *  - fixture mode reads/writes the service's in-memory preview store and
 *    is labelled capability 'preview' — never presented as live
 *    auto-negotiation. No decision history exists there, so the audit list
 *    only renders in live mode from real server rows;
 *  - live mode reads /smart-sell/policies: enable creates (or resumes) a
 *    real policy, the floor PATCHes server-side, toggle-off pauses — a
 *    cancelled policy's history is never fabricated;
 *  - the server contract carries floor + counter strategy + max rounds.
 *    Auto-decline is a preview-model-only field and renders only there.
 */

import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/settings/Switch';
import { formatPrice } from '@/lib/utils/format';
import { sanitizePriceInput } from './constants';
import { INPUT_CLASS } from './SellField';
import { useSmartSellWorkflow } from './smartsell/useSmartSellWorkflow';
import { SmartSellDecisionsList } from './smartsell/SmartSellDecisionsList';
import { SmartSellAdvancedSection } from './smartsell/SmartSellAdvancedSection';

interface SmartSellCardProps {
  listingId: string;
  /** Listing price (GBP) — seeds the floor on first enable and bounds it
   *  the same way the backend route does (10%–100% of the ask). */
  listingPrice?: number;
}

export function SmartSellCard({ listingId, listingPrice }: SmartSellCardProps) {
  const {
    user,
    stateQuery,
    decisionsQuery,
    policy,
    counterStrategy,
    isLive,
    busy,
    configured,
    quote,
    summary,
    netText,
    setNetText,
    floorText,
    setFloorText,
    declineText,
    setDeclineText,
    roundsText,
    setRoundsText,
    showAdvanced,
    setShowAdvanced,
    notice,
    setNotice,
    write,
    commitNet,
    commitFloor,
    commitDecline,
    commitRounds,
    commitOnEnter,
  } = useSmartSellWorkflow(listingId, listingPrice);

  const decisions = decisionsQuery.data ?? [];

  return (
    <section
      aria-label="Smart Sell auto-negotiation"
      className="mt-6 border-t border-border-subtle pt-5"
    >
      <div className="flex items-center gap-3">
        <Icon
          name="zap"
          size={18}
          className={policy?.enabled ? 'text-brand' : 'text-text-secondary'}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-body-strong text-text-primary">Smart Sell</h2>
          <p className="mt-0.5 truncate text-meta tnum text-text-muted">{summary}</p>
        </div>
        <Switch
          checked={Boolean(policy?.enabled)}
          onChange={(next) => write.mutate({ kind: 'toggle', next })}
          aria-label="Toggle Smart Sell auto-negotiation"
          disabled={busy || stateQuery.isLoading || !policy}
        />
      </div>

      {isLive && !user?.id ? (
        <p className="mt-4 text-caption text-text-muted">
          Sign in to manage Smart Sell on this listing.
        </p>
      ) : stateQuery.isLoading ? (
        <div className="mt-4" aria-busy aria-label="Loading Smart Sell settings">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-11 w-full max-w-[220px] rounded-md" />
        </div>
      ) : stateQuery.isError ? (
        <div className="mt-4">
          <p className="text-caption text-danger-text" role="alert">
            Couldn’t load Smart Sell settings.
          </p>
          <button
            type="button"
            onClick={() => void stateQuery.refetch()}
            className="pressable mt-2 text-caption font-medium text-text-primary"
          >
            Retry
          </button>
        </div>
      ) : policy ? (
        <>
          {/* Preview disclosure — honest in every build. */}
          {policy.capability.kind === 'preview' ? (
            <p className="mt-4 flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2.5 text-caption text-text-secondary">
              <Icon name="info" size={14} className="mt-0.5 shrink-0 text-warning-text" />
              <span>{policy.capability.reason}</span>
            </p>
          ) : null}

          {configured ? (
            <div className="mt-5">
              {/* Primary mental model: minimum payout after fees. */}
              <label
                htmlFor="smart-sell-min-net"
                className="block text-caption font-medium text-text-secondary"
              >
                Minimum payout
              </label>
              <div className="relative mt-1.5 max-w-[220px]">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
                  £
                </span>
                <input
                  id="smart-sell-min-net"
                  type="text"
                  inputMode="decimal"
                  value={netText}
                  onChange={(e) => {
                    setNotice(null);
                    setNetText(sanitizePriceInput(e.target.value));
                  }}
                  onBlur={commitNet}
                  onKeyDown={commitOnEnter}
                  placeholder="0.00"
                  maxLength={9}
                  disabled={busy}
                  className={`tnum ${INPUT_CLASS} pl-7`}
                />
              </div>
              <p className="mt-1.5 text-caption text-text-muted">
                The minimum you receive after fees — offers that net at least this are
                auto-accepted.
              </p>

              {/* Net proceeds breakdown at the floor */}
              {quote ? (
                <dl className="mt-4 max-w-[280px] text-body">
                  <div className="flex items-center justify-between py-1.5">
                    <dt className="text-text-secondary">Offer at floor</dt>
                    <dd className="tnum text-text-primary">{formatPrice(quote.gross)}</dd>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <dt className="text-text-secondary">
                      Platform fee ({Math.round(policy.feeRate * 100)}%)
                    </dt>
                    <dd className="tnum text-danger-text">−{formatPrice(quote.fee)}</dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-border-subtle py-1.5">
                    <dt className="font-medium text-text-primary">You receive</dt>
                    <dd className="tnum font-semibold text-success-text">
                      {formatPrice(quote.net)}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {/* Advanced settings section */}
              <SmartSellAdvancedSection
                showAdvanced={showAdvanced}
                setShowAdvanced={setShowAdvanced}
                isLive={isLive}
                busy={busy}
                policy={policy}
                counterStrategy={counterStrategy}
                floorText={floorText}
                setFloorText={setFloorText}
                declineText={declineText}
                setDeclineText={setDeclineText}
                roundsText={roundsText}
                setRoundsText={setRoundsText}
                setNotice={setNotice}
                commitFloor={commitFloor}
                commitDecline={commitDecline}
                commitRounds={commitRounds}
                commitOnEnter={commitOnEnter}
                onWrite={(w) => write.mutate(w)}
              />
            </div>
          ) : null}

          {notice ? (
            <p className="mt-3 text-caption text-danger-text" role="alert">
              {notice}
            </p>
          ) : null}
          {busy ? (
            <p className="mt-2 text-meta text-text-muted" aria-live="polite">
              Saving…
            </p>
          ) : null}

          {/* Decision history */}
          <SmartSellDecisionsList decisions={decisions} />
        </>
      ) : null}
    </section>
  );
}
