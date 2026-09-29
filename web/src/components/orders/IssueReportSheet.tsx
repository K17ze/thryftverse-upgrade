'use client';

/**
 * IssueReportSheet — port of mobile IssueCategorySelector + the
 * OrderSupportScreen evidence model. The buyer picks a specific issue
 * type; contextual issues for the current order state are listed first.
 * Reason-specific evidence guidance decides whether the photo field
 * renders — no accusatory photo theatre for parcel problems (§11.4).
 * Selection returns the category, note and attached evidence upstream —
 * the parent wires it to the support-ticket flow.
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';
import {
  EvidencePhotoField,
  type EvidencePhoto,
} from './EvidencePhotoField';

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

/**
 * Reason-specific evidence guidance — 1:1 port of mobile
 * EVIDENCE_GUIDANCE (OrderSupportScreen), extended onto the web category
 * vocabulary. `needsPhotos: false` + empty hint hides the field entirely.
 */
const EVIDENCE_GUIDANCE: Record<string, { needsPhotos: boolean; hint: string }> = {
  not_as_described: { needsPhotos: true, hint: 'Attach photos showing how the item differs from the listing.' },
  damaged: { needsPhotos: true, hint: 'Attach photos of the damage and the original packaging.' },
  wrong_item: { needsPhotos: true, hint: 'Attach a photo of the item you received.' },
  counterfeit: { needsPhotos: true, hint: 'Attach photos of labels, stitching or serial marks.' },
  missing_contents: { needsPhotos: true, hint: 'Attach photos of the parcel and what arrived.' },
  parcel_issue: { needsPhotos: false, hint: '' },
  delivery_failed: { needsPhotos: false, hint: '' },
  returned: { needsPhotos: false, hint: '' },
};

interface Props {
  open: boolean;
  /** State-specific issues, listed first (e.g. failed delivery). */
  contextualIssues?: IssueCategory[];
  onSelect: (category: IssueCategory, note: string, evidenceUris: string[]) => void;
  onClose: () => void;
}

export function IssueReportSheet({ open, contextualIssues, onSelect, onClose }: Props) {
  const [selected, setSelected] = useState<IssueCategory | null>(null);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<EvidencePhoto[]>([]);

  const hasContextual = contextualIssues != null && contextualIssues.length > 0;

  const evidenceConfig = selected ? EVIDENCE_GUIDANCE[selected.id] : null;
  const uploading = evidence.some((e) => e.state === 'uploading');
  const failedCount = evidence.filter((e) => e.state === 'failed').length;

  const reset = () => {
    for (const item of evidence) {
      if (item.uri.startsWith('blob:')) URL.revokeObjectURL(item.uri);
    }
    setSelected(null);
    setNote('');
    setEvidence([]);
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
            <p className="text-label text-text-muted">
              For this order
            </p>
            {contextualIssues.map((c) => (
              <Row key={c.id} category={c} />
            ))}
            <p className="mt-3 text-label text-text-muted">
              Other issues
            </p>
          </>
        ) : null}

        {ISSUE_CATEGORIES.map((c) => (
          <Row key={c.id} category={c} />
        ))}

        {selected && evidenceConfig?.needsPhotos ? (
          <EvidencePhotoField
            label="Evidence"
            hint={evidenceConfig.hint}
            items={evidence}
            onChange={setEvidence}
          />
        ) : null}
        {failedCount > 0 ? (
          <p className="mt-2 text-caption text-danger-text">
            {failedCount === 1 ? 'One photo' : `${failedCount} photos`} could not be uploaded —
            remove {failedCount === 1 ? 'it' : 'them'} or continue without.
          </p>
        ) : null}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          aria-label="Note for the support team"
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
            disabled={!selected || uploading}
            onClick={() => {
              if (!selected) return;
              // Only confirmed attachments travel with the case — failed
              // uploads are dropped rather than sent as dead URLs.
              const uris = evidence
                .filter((e) => e.state === 'attached')
                .map((e) => e.uri);
              onSelect(selected, note.trim(), uris);
              reset();
            }}
            className="pressable flex-1 rounded-md bg-brand py-3 text-body-emphasis font-semibold text-text-inverse disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Continue'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
