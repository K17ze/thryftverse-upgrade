'use client';

/**
 * /co-own/[id]/issue — port of mobile CoOwnIssueScreen. A holder or
 * watcher flags a problem on one asset: pick a category, describe what
 * happened, submit → a real support case is created and the receipt
 * carries its reference with a link to the /support/[id] thread.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import type { CoOwnIssueCategory } from '@/lib/contracts/coown';
import { DATA_MODE } from '@/lib/api/client';
import { reportCoOwnIssue } from '@/lib/api/services/coown';
import { useCoOwnAsset } from '@/lib/hooks/coown-queries';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useSupportActions,
  useSupportTickets,
} from '@/components/support/useSupportTickets';
import { AssetThumb } from '../AssetThumb';

const MIN_DESCRIPTION = 10;

const CATEGORIES: { value: CoOwnIssueCategory; label: string; icon: AppIconName }[] = [
  { value: 'dispute', label: 'Ownership dispute', icon: 'alert' },
  { value: 'technical', label: 'Technical problem', icon: 'chip' },
  { value: 'fraud', label: 'Fraud or scam', icon: 'warning' },
  { value: 'other', label: 'Other', icon: 'chat' },
];

function IssueSkeleton() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-2xl">
      <div className="skeleton h-4 w-24 rounded-sm" aria-hidden="true" />
      <div className="mt-4 skeleton h-9 w-56 rounded-sm" aria-hidden="true" />
      <div className="mt-8 space-y-4" aria-hidden="true">
        <div className="skeleton h-14 rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-24 rounded-lg" />
          <div className="skeleton h-24 rounded-lg" />
          <div className="skeleton h-24 rounded-lg" />
          <div className="skeleton h-24 rounded-lg" />
        </div>
        <div className="skeleton h-32 rounded-lg" />
      </div>
    </div>
  );
}

export function ReportIssueView({ id }: { id: string }) {
  const router = useRouter();
  const { show } = useToast();
  const { isGuest, sessionLoading } = useSession();
  const { createTicket } = useSupportActions();
  // Subscribe so the ticket cache is warm before submit — createTicket
  // writes through it, and the /support/[id] link reads it.
  useSupportTickets();
  const { data: asset, isLoading, isError, refetch } = useCoOwnAsset(id);

  const [category, setCategory] = useState<CoOwnIssueCategory | null>(null);
  const [description, setDescription] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ ref: string; id: string } | null>(null);

  if (sessionLoading || isLoading) return <IssueSkeleton />;

  // Cases are account-bound — a guest's report would fail the live POST
  // anyway, so the wall beats a dead-end error.
  if (isGuest && DATA_MODE === 'live') {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="alert"
          title="Sign in to report an issue"
          subtitle="Reports open a support case on your account."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </div>
    );
  }

  if (isError || !asset) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="alert"
          title="Asset unavailable"
          subtitle={
            isError
              ? "We couldn't load this item. Check your connection and try again."
              : 'This Co-Own item may have been delisted.'
          }
          actionLabel={isError ? 'Retry' : 'Back to markets'}
          onAction={() => (isError ? void refetch() : router.push('/co-own'))}
        />
      </div>
    );
  }

  const submit = async () => {
    let valid = true;
    if (!category) {
      setCategoryError('Select an issue category');
      valid = false;
    }
    if (description.trim().length < MIN_DESCRIPTION) {
      setDescriptionError('Add at least 10 characters so the team can investigate.');
      valid = false;
    }
    if (!valid) return;

    setSubmitting(true);
    const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label ?? 'Issue';
    try {
      let issueRef: string | null = null;
      if (DATA_MODE === 'live') {
        // The asset-anchored record — same endpoint the mobile app posts
        // to; lands in the compliance audit trail with the category.
        const issue = await reportCoOwnIssue(asset.id, {
          category: category!,
          description: description.trim(),
        });
        issueRef = issue.id;
      }
      // The support thread — /support/[id] is where follow-up lands.
      // No minted local refs; the receipt carries the real case id.
      const ticket = await createTicket({
        topicId: 'other',
        orderRef: null,
        message:
          `Co-Own issue — ${categoryLabel} · ${asset.title} (${asset.id})` +
          (issueRef ? ` · ref ${issueRef}` : '') +
          ` — ${description.trim()}`,
      });
      setSubmitted({ ref: issueRef ?? ticket.ref ?? ticket.id.toUpperCase(), id: ticket.id });
      show('Issue reported', 'success');
    } catch {
      show("Couldn't submit the report — check your connection and try again.", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-2xl">
      <Link
        href={`/co-own/${asset.id}`}
        className="pressable inline-flex items-center gap-1.5 text-body font-medium text-text-secondary hover:text-text-primary"
      >
        <Icon name="back" size={16} />
        {asset.title}
      </Link>

      <header className="mt-4">
        <h1 className="text-editorial-display text-text-primary">Report an issue</h1>
        <p className="mt-2 text-meta text-text-secondary">Help us resolve your concern.</p>
      </header>

      {submitted ? (
        /* Submitted — real case reference + thread link for follow-up. */
        <section className="mt-10 flex flex-col items-center pt-6 text-center" aria-live="polite">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-text-inverse">
            <Icon name="check" size={28} />
          </span>
          <h2 className="mt-5 text-section-title font-semibold text-text-primary">Case submitted</h2>
          <p className="mt-1.5 text-body font-semibold text-text-secondary tnum">
            Reference #{submitted.ref}
          </p>
          <p className="mt-3 max-w-sm text-body text-text-muted">
            Your report opened a support case — replies and updates appear on the case thread.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => router.push(`/co-own/${asset.id}`)}
            >
              Done
            </Button>
            <Link
              href={`/support/${submitted.id}`}
              className="pressable text-body font-medium text-brand underline-offset-4 hover:underline"
            >
              View your case
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Asset context — the report is anchored to one item. */}
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-alt p-3">
            <AssetThumb src={asset.imageUrl} alt={asset.title} className="w-11" />
            <span className="text-meta text-text-muted">Item:</span>
            <span className="min-w-0 flex-1 truncate text-body font-semibold text-text-primary">
              {asset.title}
            </span>
          </div>

          {/* Category picker — 2×2 grid, one selected grammar */}
          <fieldset className="mt-6">
            <legend className="text-label text-text-muted">
              Issue category
            </legend>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {CATEGORIES.map((cat) => {
                const active = category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setCategory(cat.value);
                      setCategoryError(null);
                    }}
                    className={`pressable flex flex-col items-start gap-2.5 rounded-lg border p-4 text-left transition-colors ${
                      active
                        ? 'border-brand bg-surface-alt'
                        : categoryError
                          ? 'border-danger-border bg-surface'
                          : 'border-border bg-surface hover:border-text-muted'
                    }`}
                  >
                    <Icon
                      name={cat.icon}
                      size={22}
                      className={active ? 'text-brand' : 'text-text-secondary'}
                    />
                    <span
                      className={`text-body font-semibold ${
                        active ? 'text-brand' : 'text-text-primary'
                      }`}
                    >
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {categoryError ? (
              <p role="alert" className="mt-2 text-meta text-danger-text">
                {categoryError}
              </p>
            ) : null}
          </fieldset>

          {/* Description */}
          <div className="mt-6">
            <label
              htmlFor="issue-description"
              className="text-label text-text-muted"
            >
              Description
            </label>
            <textarea
              id="issue-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescriptionError(null);
              }}
              maxLength={4000}
              rows={5}
              placeholder="Describe what happened and what you need…"
              className="mt-2 w-full resize-y rounded-md border border-border bg-input px-3.5 py-3 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none"
            />
            {descriptionError ? (
              <p role="alert" className="mt-1.5 text-meta text-danger-text">
                {descriptionError}
              </p>
            ) : null}
          </div>

          {/* How it works — honest fixture-mode note */}
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-alt p-4">
            <Icon name="info" size={16} className="mt-0.5 shrink-0 text-text-secondary" />
            <div>
              <p className="text-body font-semibold text-text-primary">How this works</p>
              <p className="mt-1 text-meta text-text-muted">
                Your report opens a support case for the team to review — you can follow the thread
                in Help &amp; Support.
              </p>
            </div>
          </div>

          <Button
            size="lg"
            fullWidth
            className="mt-8"
            disabled={submitting || !category || description.trim().length < MIN_DESCRIPTION}
            onClick={() => void submit()}
          >
            {submitting ? 'Submitting…' : 'Submit report'}
          </Button>
        </>
      )}
    </div>
  );
}
