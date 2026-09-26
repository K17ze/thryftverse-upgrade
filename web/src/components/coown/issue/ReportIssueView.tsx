'use client';

/**
 * /co-own/[id]/issue — port of mobile CoOwnIssueScreen. A holder or
 * watcher flags a problem on one asset: pick a category, describe what
 * happened, submit → a case reference is returned for follow-up.
 *
 * Fixture mode: nothing leaves the device — the report is stamped with a
 * local reference and the copy says so.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import type { CoOwnIssueCategory } from '@/lib/contracts/coown';
import { useCoOwnAsset } from '@/lib/hooks/coown-queries';
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
    <div className="mx-auto w-full max-w-xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
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
  const { data: asset, isLoading, isError, refetch } = useCoOwnAsset(id);

  const [category, setCategory] = useState<CoOwnIssueCategory | null>(null);
  const [description, setDescription] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [caseRef, setCaseRef] = useState<string | null>(null);

  if (isLoading) return <IssueSkeleton />;

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

  const submit = () => {
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
    // Fixture mode — the case is acknowledged locally with a reference.
    const ref = Math.random().toString(36).slice(2, 10).toUpperCase();
    setCaseRef(ref);
    setSubmitting(false);
    show('Issue reported', 'success');
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
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

      {caseRef ? (
        /* Submitted — case reference for follow-up. */
        <section className="mt-10 flex flex-col items-center pt-6 text-center" aria-live="polite">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-text-inverse">
            <Icon name="check" size={28} />
          </span>
          <h2 className="mt-5 text-section-title font-semibold text-text-primary">Case submitted</h2>
          <p className="mt-1.5 text-body font-semibold text-text-secondary tnum">
            Reference #{caseRef}
          </p>
          <p className="mt-3 max-w-sm text-body text-text-muted">
            Demo build — the report is kept on this device. In production it goes to the support
            team for review; keep the reference for follow-up.
          </p>
          <Button
            variant="secondary"
            size="lg"
            className="mt-8"
            onClick={() => router.push(`/co-own/${asset.id}`)}
          >
            Done
          </Button>
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
            <legend className="text-label font-semibold uppercase tracking-wider text-text-muted">
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
              className="text-label font-semibold uppercase tracking-wider text-text-muted"
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
                Your report is submitted to the support team for review — you can follow up in Help
                &amp; Support. Demo build: nothing leaves this device; you&apos;ll get a local
                reference back.
              </p>
            </div>
          </div>

          <Button
            size="lg"
            fullWidth
            className="mt-8"
            disabled={submitting || !category || description.trim().length < MIN_DESCRIPTION}
            onClick={submit}
          >
            {submitting ? 'Submitting…' : 'Submit report'}
          </Button>
        </>
      )}
    </div>
  );
}
