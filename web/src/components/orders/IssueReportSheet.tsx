'use client';

/**
 * IssueReportSheet — port of mobile IssueCategorySelector. The buyer picks
 * a specific issue type; contextual issues for the current order state are
 * listed first. Selection returns the category upstream — the parent wires
 * it to the support-ticket flow.
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';

export interface IssueCategory {
  id: string;
  label: string;
  description: string;
}

export const ISSUE_CATEGORIES: IssueCategory[] = [
  { id: 'not_as_described', label: 'Item not as described', description: 'Differs from the listing photos or description' },
  { id: 'damaged', label: 'Arrived damaged', description: 'Broken or damaged in transit' },
  { id: 'wrong_item', label: 'Wrong item sent', description: 'A different item arrived' },
  { id: 'counterfeit', label: 'Authenticity concern', description: 'The item may not be genuine' },
  { id: 'parcel_issue', label: 'Parcel problem', description: 'Lost, late or the delivery failed' },
  { id: 'missing_contents', label: 'Missing contents', description: 'Something is missing from the parcel' },
];

interface Props {
  open: boolean;
  /** State-specific issues, listed first (e.g. failed delivery). */
  contextualIssues?: IssueCategory[];
  onSelect: (category: IssueCategory, note: string) => void;
  onClose: () => void;
}

export function IssueReportSheet({ open, contextualIssues, onSelect, onClose }: Props) {
  const [selected, setSelected] = useState<IssueCategory | null>(null);
  const [note, setNote] = useState('');

  const hasContextual = contextualIssues != null && contextualIssues.length > 0;

  const reset = () => {
    setSelected(null);
    setNote('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const Row = ({ category }: { category: IssueCategory }) => (
    <button
      type="button"
      onClick={() => setSelected(category)}
      aria-pressed={selected?.id === category.id}
      className="pressable flex min-h-11 w-full items-center gap-3 border-b border-border-subtle py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-body-emphasis font-medium text-text-primary">
          {category.label}
        </span>
        <span className="mt-0.5 block text-caption text-text-muted">{category.description}</span>
      </span>
      <Icon
        name={selected?.id === category.id ? 'check' : 'forward'}
        size={16}
        className={selected?.id === category.id ? 'text-text-primary' : 'text-text-muted'}
      />
    </button>
  );

  return (
    <Sheet open={open} onClose={handleClose} title="Report an issue" maxWidth={480}>
      <div className="px-5 pb-6">
        <p className="mb-2 text-body text-text-secondary">
          What went wrong with this order?
        </p>

        {hasContextual ? (
          <>
            <p className="text-label font-medium uppercase tracking-wide text-text-muted">
              For this order
            </p>
            {contextualIssues.map((c) => (
              <Row key={c.id} category={c} />
            ))}
            <p className="mt-3 text-label font-medium uppercase tracking-wide text-text-muted">
              Other issues
            </p>
          </>
        ) : null}

        {ISSUE_CATEGORIES.map((c) => (
          <Row key={c.id} category={c} />
        ))}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Add a short note for the support team (optional)"
          className="mt-4 w-full rounded-md border border-border bg-input px-3 py-2 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
        />

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="pressable flex-1 rounded-md border border-border py-3 text-body-emphasis font-medium text-text-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onSelect(selected, note.trim());
              reset();
            }}
            className="pressable flex-1 rounded-md bg-brand py-3 text-body-emphasis font-semibold text-text-inverse disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    </Sheet>
  );
}
