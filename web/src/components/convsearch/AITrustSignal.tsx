'use client';

/**
 * AITrustSignal — per-answer trust row for conversational search.
 * Web port of mobile components/ai/AITrustSignal: qualitative confidence
 * dot + label (never a fabricated percentage), a source citation naming
 * the real matched keywords, a "Demo" badge in fixture mode, and
 * progressive disclosure — a chevron reveals the honest mechanics of
 * the match. Colour is never the sole signal; the label always reads.
 */

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { AnswerConfidence } from './convSearchEngine';

interface AITrustSignalProps {
  confidence: AnswerConfidence;
  /** Why the answer looks like this — e.g. "Matched keywords: Brand: Nike". */
  source: string;
  /** Detailed mechanics revealed on expand. */
  expanded?: string;
  /** True in fixture mode — the answer came from the sample catalogue. */
  isDemo?: boolean;
}

const CONFIDENCE_LABEL: Record<AnswerConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  exploratory: 'Exploratory',
};

/** Dot colour per level — semantic tokens; the text label is the primary
 *  signal, the dot is redundancy for the colour-sighted. */
const DOT_CLASS: Record<AnswerConfidence, string> = {
  high: 'bg-success',
  medium: 'bg-warning',
  low: 'bg-danger',
  exploratory: 'bg-text-muted',
};

export function AITrustSignal({
  confidence,
  source,
  expanded,
  isDemo,
}: AITrustSignalProps) {
  const [open, setOpen] = useState(false);
  const canExpand = Boolean(expanded);

  const a11y = [CONFIDENCE_LABEL[confidence], `Source: ${source}`]
    .concat(isDemo ? ['Demo mode'] : [])
    .join('. ');

  return (
    <div
      role="group"
      aria-label={a11y}
      className="rounded-md border border-border-subtle px-3 py-2.5"
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[confidence]}`}
          />
          <span className="clamp-1 text-meta font-medium text-text-secondary">
            {CONFIDENCE_LABEL[confidence]}
          </span>
          {isDemo ? (
            <span className="ml-1 shrink-0 rounded-full border border-border bg-surface-alt px-1.5 py-px text-micro font-medium uppercase tracking-wide text-text-muted">
              Demo
            </span>
          ) : null}
        </span>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Hide match details' : 'Show match details'}
            className="pressable -my-2 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:text-text-primary"
          >
            <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} />
          </button>
        ) : null}
      </div>

      <p className="clamp-2 mt-1 text-meta text-text-secondary">{source}</p>

      {canExpand && open ? (
        <p className="mt-2 border-t border-border-subtle pt-2 text-meta leading-relaxed text-text-secondary">
          {expanded}
        </p>
      ) : null}
    </div>
  );
}
