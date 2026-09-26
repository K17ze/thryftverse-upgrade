'use client';

/**
 * AppealView — the /appeal surface.
 *
 * Web port of the mobile AppealScreen. Mobile fetches a decision summary
 * for a known decisionId; the web preview has no moderation-decision feed,
 * so the honest equivalent asks the member which decision they're
 * appealing and accepts an optional reference. Submitting opens a real
 * support case via useSupportActions.createTicket — the case lands in
 * /support with an honest 'open' status, and the member can track or
 * extend it there. The ticket's orderRef stays null: the field links to
 * an order page, and a decision reference would fabricate one.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import type { SupportTopicId } from '@/lib/contracts/support';
import { useSupportActions, useSupportTickets } from '@/components/support/useSupportTickets';

interface DecisionOption {
  id: string;
  label: string;
  sub: string;
  /** Support topic the appeal case is filed under. */
  topicId: SupportTopicId;
}

const DECISIONS: DecisionOption[] = [
  {
    id: 'account',
    label: 'Account restriction',
    sub: 'Your account was restricted or suspended',
    topicId: 'other',
  },
  {
    id: 'listing',
    label: 'Listing removed',
    sub: 'A listing was taken down for a policy violation',
    topicId: 'other',
  },
  {
    id: 'verification',
    label: 'Verification declined',
    sub: 'Identity or seller verification was declined',
    topicId: 'verification',
  },
  {
    id: 'payout',
    label: 'Payout or payment held',
    sub: 'A payout or payment was held for review',
    topicId: 'payments',
  },
  {
    id: 'other',
    label: 'Another decision',
    sub: 'Any other moderation decision you disagree with',
    topicId: 'other',
  },
];

const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none';

export function AppealView() {
  const router = useRouter();
  // subscribe so the ticket cache is warm before submit — createTicket
  // writes into it, and a cold cache would silently drop the case.
  const { data: tickets, isLoading } = useSupportTickets();
  const { createTicket } = useSupportActions();

  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [grounds, setGrounds] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; ref: string } | null>(null);

  const decision = DECISIONS.find((d) => d.id === decisionId) ?? null;
  const canSubmit = decision !== null && grounds.trim().length >= 10 && tickets !== undefined;

  const submit = async () => {
    setTouched(true);
    if (!canSubmit || !decision) return;
    const ref = reference.trim();
    const body =
      `Appeal — ${decision.label}` +
      (ref ? `\nReference: ${ref}` : '') +
      `\n\n${grounds.trim()}`;
    const ticket = await createTicket({ topicId: decision.topicId, orderRef: null, message: body });
    setSubmitted({ id: ticket.id, ref: ticket.ref });
  };

  return (
    <div className="mx-auto w-full max-w-2xl pb-16 pt-2 md:pt-6">
      <div className="flex items-center px-2 sm:px-4">
        <IconButton
          name="back"
          aria-label="Back"
          onClick={() => router.back()}
          className="-ml-1"
        />
        <h1 className="ml-1 text-screen-title font-semibold text-text-primary">
          Appeal a decision
        </h1>
      </div>

      {submitted ? (
        /* Submitted — the case is open and lives in Support. */
        <div className="flex flex-col items-center px-8 pt-16 text-center">
          <Icon name="check" size={28} className="text-text-primary" />
          <h2 className="mt-4 text-section-title font-semibold text-text-primary">
            Appeal submitted
          </h2>
          <p className="tnum mt-1.5 text-body-emphasis font-semibold text-text-primary">
            Case {submitted.ref}
          </p>
          <p className="mt-1.5 max-w-xs text-caption leading-relaxed text-text-muted">
            Open and queued for review — the team responds on the case in
            Support.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={() => router.push(`/support/${submitted.id}`)}
            >
              View case
            </Button>
            <button
              type="button"
              onClick={() => router.push('/settings')}
              className="pressable flex h-11 items-center px-4 text-body text-text-muted hover:text-text-secondary"
            >
              Back to settings
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {/* Decision type — the picker mobile resolves from decisionId. */}
          <section aria-label="Decision type">
            <h2 className="px-4 pb-2 text-label font-semibold uppercase tracking-wider text-text-muted sm:px-5">
              What are you appealing?
            </h2>
            {isLoading ? (
              <div className="divide-y divide-border-subtle border-y border-border-subtle" aria-busy>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-[56px] w-full rounded-none" />
                ))}
              </div>
            ) : (
              <ul
                role="radiogroup"
                aria-label="Decision type"
                className="divide-y divide-border-subtle border-y border-border-subtle"
              >
                {DECISIONS.map((d) => {
                  const selected = decisionId === d.id;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setDecisionId(d.id)}
                        className={`pressable flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5 ${
                          selected ? '' : 'hover:bg-surface-alt'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-body-emphasis text-text-primary">{d.label}</p>
                          <p className="clamp-1 text-caption text-text-muted">{d.sub}</p>
                        </div>
                        {selected ? (
                          <Icon name="check" size={18} className="shrink-0 text-text-primary" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Grounds — the dominant input. */}
          <section aria-label="Why are you appealing" className="mt-8 px-4 sm:px-5">
            <label
              htmlFor="appeal-grounds"
              className="text-label font-semibold uppercase tracking-wider text-text-muted"
            >
              Why are you appealing?
            </label>
            <textarea
              id="appeal-grounds"
              value={grounds}
              onChange={(e) => setGrounds(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder="Tell us what was decided and why you think it was wrong."
              className={`mt-1.5 min-h-[120px] resize-y py-3 ${FIELD_CLASS}`}
            />
            <p className="mt-1.5 text-right text-meta text-text-muted">
              <span className="tnum">{grounds.length}</span>/2000
            </p>
            {touched && grounds.trim().length < 10 ? (
              <p className="mt-1 text-caption text-danger-text">
                Give us a sentence or two — at least 10 characters.
              </p>
            ) : null}
          </section>

          {/* Optional reference — carried in the message body, never in
              orderRef (that field links to an order page). */}
          <section aria-label="Reference" className="mt-2 px-4 sm:px-5">
            <label
              htmlFor="appeal-reference"
              className="text-label font-semibold uppercase tracking-wider text-text-muted"
            >
              Reference <span className="normal-case text-text-muted">(optional)</span>
            </label>
            <input
              id="appeal-reference"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="From the decision email or notification, if you have one"
              className={`tnum mt-1.5 ${FIELD_CLASS}`}
            />
          </section>

          <div className="mt-6 px-4 sm:px-5">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canSubmit}
              onClick={submit}
            >
              Submit appeal
            </Button>
            <p className="mt-3 flex items-start gap-1.5 text-caption text-text-muted">
              <Icon name="info" size={14} className="mt-px shrink-0" />
              Submitting opens a support case — you can add evidence and follow
              the review there.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
