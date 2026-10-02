'use client';

import { Icon } from '@/components/ui/Icon';
import type { SellDraft, SellErrors } from '../constants';

/**
 * One reviewable suggestion row — mirrors the mobile AIPoweredListingScreen
 * SuggestionRow. `value` is what the seller reads (display name, mapped
 * condition); `patch` is the concrete draft write an accept performs —
 * absent for informational rows (colour: the draft has no colour field,
 * so the row renders dismiss-only, the same call mobile makes).
 */
export interface AutoFillSuggestion {
  /** Stable key — the draft field it targets ('title', 'brand', …). */
  key: string;
  /** Field label as the composer presents it. */
  label: string;
  /** Display value under review. */
  value: string;
  /** Wire evidence detail, verbatim (e.g. `Found "nike" in filename`). */
  evidence?: string | null;
  patch?: Partial<SellDraft>;
  /** Draft error keys cleared when this suggestion is accepted. */
  clears?: (keyof SellErrors)[];
  status: 'pending' | 'accepted' | 'dismissed';
}

/**
 * Auto-fill control — the assisted-extraction affordance for the photos
 * step (POST /listing-intelligence/run via the parent). Rendered only in
 * live mode: fixture mode has no backend to consult and a dead button
 * would be dishonest. The run never writes to the draft — it surfaces a
 * per-field review list and each candidate lands only on explicit accept
 * (or accept-all). Anything left pending is inert.
 */
export interface AutoFillControl {
  phase: 'idle' | 'running' | 'review' | 'done' | 'empty' | 'error';
  /** Review rows — present when phase === 'review'. */
  suggestions?: AutoFillSuggestion[];
  /** Field keys the seller accepted (e.g. 'title', 'brand'). */
  applied?: string[];
  /** The backend's own failure text when phase === 'error'. */
  message?: string | null;
  /** Honest provenance for the review/done line (e.g. 'the photo filename'). */
  basis?: string | null;
  onRun: () => void;
  onAccept?: (key: string) => void;
  onDismissField?: (key: string) => void;
  onAcceptAll?: () => void;
  /** Dismiss-all while reviewing; dismiss the report once resolved. */
  onDismiss?: () => void;
}

export function PhotoAutoFillReview({ autoFill }: { autoFill: AutoFillControl }) {
  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      {autoFill.phase === 'idle' || autoFill.phase === 'running' ? (
        <button
          type="button"
          onClick={autoFill.onRun}
          disabled={autoFill.phase === 'running'}
          className="pressable flex h-11 items-center gap-2 rounded-md text-body font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
        >
          <Icon name="scan" size={16} />
          {autoFill.phase === 'running'
            ? 'Reading photo details…'
            : 'Auto-fill details'}
        </button>
      ) : autoFill.phase === 'review' && autoFill.suggestions?.length ? (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-caption font-medium text-text-secondary">
              Suggestions
              {autoFill.basis ? ` from ${autoFill.basis}` : ''} — accept what fits,
              dismiss the rest.
            </p>
            <div className="flex shrink-0 items-center gap-3">
              {autoFill.onAcceptAll ? (
                <button
                  type="button"
                  onClick={autoFill.onAcceptAll}
                  className="pressable text-caption font-semibold text-text-primary underline-offset-4 hover:underline"
                >
                  Accept all
                </button>
              ) : null}
              {autoFill.onDismiss ? (
                <button
                  type="button"
                  onClick={autoFill.onDismiss}
                  className="pressable text-caption font-medium text-text-muted underline-offset-4 hover:text-text-primary"
                >
                  Dismiss all
                </button>
              ) : null}
            </div>
          </div>
          <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
            {autoFill.suggestions
              .filter((s) => s.status === 'pending')
              .map((s) => (
                <li key={s.key} className="flex items-start gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-caption text-text-muted">{s.label}</p>
                    <p className="text-body text-text-primary">{s.value}</p>
                    {s.evidence ? (
                      <p className="text-caption text-text-muted">
                        {s.evidence}
                      </p>
                    ) : null}
                  </div>
                  {s.patch && autoFill.onAccept ? (
                    <button
                      type="button"
                      onClick={() => autoFill.onAccept?.(s.key)}
                      aria-label={`Use suggested ${s.label.toLowerCase()}`}
                      className="pressable mt-0.5 shrink-0 rounded-md p-1 text-success-text transition-colors hover:text-text-primary"
                    >
                      <Icon name="check" size={16} />
                    </button>
                  ) : null}
                  {autoFill.onDismissField ? (
                    <button
                      type="button"
                      onClick={() => autoFill.onDismissField?.(s.key)}
                      aria-label={`Dismiss suggested ${s.label.toLowerCase()}`}
                      className="pressable mt-0.5 shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ) : autoFill.phase === 'error' ? (
        <div role="alert" className="flex items-start gap-2.5">
          <Icon
            name="warning"
            size={16}
            className="mt-0.5 shrink-0 text-danger-text"
          />
          <div className="min-w-0 flex-1">
            <p className="text-caption text-text-secondary">
              {autoFill.message ?? 'Couldn’t read the photo details.'} Fill them
              in below.
            </p>
            <button
              type="button"
              onClick={autoFill.onRun}
              className="pressable mt-1 text-caption font-semibold text-text-primary underline-offset-4 hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5">
          <Icon
            name={autoFill.phase === 'done' ? 'check' : 'info'}
            size={16}
            className={`mt-0.5 shrink-0 ${
              autoFill.phase === 'done'
                ? 'text-success-text'
                : 'text-text-muted'
            }`}
          />
          <p className="min-w-0 flex-1 text-caption text-text-secondary">
            {autoFill.phase === 'done' && autoFill.applied?.length
              ? `Added ${autoFill.applied.join(', ')}${
                  autoFill.basis ? ` from ${autoFill.basis}` : ''
                } — edit anything below.`
              : autoFill.message ??
                'Nothing readable to suggest — fill the details below.'}
          </p>
          {autoFill.onDismiss ? (
            <button
              type="button"
              onClick={autoFill.onDismiss}
              aria-label="Dismiss"
              className="pressable -m-1 shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
            >
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
