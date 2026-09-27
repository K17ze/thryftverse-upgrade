'use client';

/**
 * EditCollectionSheet — port of the mobile EditCollectionScreen:
 * name, description and privacy in one quiet form with a dirty-gated
 * save. Writes go through the collections query actions (PATCH
 * /collections live; session store + fixture patch in demo mode) plus the
 * collectionEdits overlay so header reads stay reactive.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';

interface EditCollectionSheetProps {
  collectionId: string;
  open: boolean;
  onClose: () => void;
  initial: {
    title: string;
    description: string | null;
    isPrivate: boolean;
  };
  onSave: (
    next: { title: string; description: string | null; isPrivate: boolean },
  ) => void | Promise<void>;
}

export function EditCollectionSheet({
  open,
  onClose,
  initial,
  onSave,
}: EditCollectionSheetProps) {
  const { show } = useToast();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? '');
  const [isPrivate, setIsPrivate] = useState(initial.isPrivate);
  const [saving, setSaving] = useState(false);

  // Re-seed the form each time the sheet opens — stale drafts from a
  // previous session would otherwise shadow fresh fixture truth.
  useEffect(() => {
    if (open) {
      setTitle(initial.title);
      setDescription(initial.description ?? '');
      setIsPrivate(initial.isPrivate);
    }
  }, [open, initial.title, initial.description, initial.isPrivate]);

  const dirty =
    title.trim() !== initial.title ||
    description.trim() !== (initial.description ?? '') ||
    isPrivate !== initial.isPrivate;

  const save = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || saving) return;
    setSaving(true);
    try {
      await onSave({
        title: nextTitle,
        description: description.trim() || null,
        isPrivate,
      });
      onClose();
      show('Collection updated', 'success');
    } catch {
      show('Could not save the collection', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit collection" maxWidth={440}>
      <div className="px-5 pb-5">
        <label className="block">
          <span className="text-meta font-semibold uppercase tracking-wide text-text-muted">
            Name
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            aria-label="Collection name"
            className="mt-1.5 h-11 w-full rounded-lg bg-input px-3.5 text-body text-input-text outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-meta font-semibold uppercase tracking-wide text-text-muted">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="What's this collection for?"
            aria-label="Collection description"
            className="mt-1.5 w-full resize-none rounded-lg bg-input px-3.5 py-2.5 text-body text-input-text outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
          />
          <span className="tnum mt-0.5 block text-right text-micro text-text-muted">
            {description.length}/200
          </span>
        </label>

        {/* Privacy — the same row grammar as the options sheet toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={isPrivate}
          onClick={() => setIsPrivate((v) => !v)}
          className="pressable mt-2 flex min-h-12 w-full items-center gap-3.5 py-2 text-left"
        >
          <Icon name={isPrivate ? 'lock' : 'globe'} size={20} className="text-text-secondary" />
          <span className="flex-1">
            <span className="block text-body-emphasis font-medium text-text-primary">
              {isPrivate ? 'Private' : 'Public'}
            </span>
            <span className="block text-meta text-text-muted">
              {isPrivate
                ? 'Only you can see this board'
                : 'Anyone with the link can view this board'}
            </span>
          </span>
          <span
            aria-hidden
            className={`relative h-6 w-11 rounded-full transition-colors ${
              isPrivate ? 'bg-brand' : 'bg-surface-elevated'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${
                isPrivate
                  ? 'translate-x-[22px] bg-text-inverse'
                  : 'translate-x-0.5 bg-text-muted'
              }`}
            />
          </span>
        </button>

        <Button
          variant="primary"
          size="md"
          fullWidth
          disabled={!dirty || !title.trim() || saving}
          onClick={() => void save()}
          className="mt-4"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Sheet>
  );
}
