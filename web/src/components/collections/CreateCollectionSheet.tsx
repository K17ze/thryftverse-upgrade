'use client';

/**
 * CreateCollectionSheet — name + privacy form for a new board. Flat rows
 * over hairlines (mobile SaveToCollectionModal grammar); writes to the
 * session collection store and returns the created board so the caller can
 * navigate to it.
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useCollectionActions } from '@/lib/hooks/collections-queries';
import type { UserCollection } from '@/lib/data/fixtures-collections';

type Privacy = 'public' | 'private';

const PRIVACY_OPTIONS: {
  key: Privacy;
  icon: 'globe' | 'lock';
  title: string;
  subtitle: string;
}[] = [
  {
    key: 'public',
    icon: 'globe',
    title: 'Public',
    subtitle: 'Anyone can see this collection',
  },
  {
    key: 'private',
    icon: 'lock',
    title: 'Private',
    subtitle: 'Only you can see this collection',
  },
];

interface CreateCollectionSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (collection: UserCollection) => void;
}

export function CreateCollectionSheet({
  open,
  onClose,
  onCreated,
}: CreateCollectionSheetProps) {
  const { createCollection } = useCollectionActions();
  const [name, setName] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setPrivacy('public');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const collection = await createCollection({ name: trimmed, isPrivate: privacy === 'private' });
    reset();
    onClose();
    onCreated?.(collection);
  };

  return (
    <Sheet open={open} onClose={handleClose} title="New collection" maxWidth={480}>
      <div className="px-5 py-5">
        <label
          htmlFor="collection-name"
          className="text-label font-semibold uppercase tracking-wider text-text-muted"
        >
          Name
        </label>
        <input
          id="collection-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
          }}
          placeholder="e.g. Winter capsule"
          maxLength={60}
          autoFocus
          className="mt-2 h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none"
        />

        <p className="mt-5 text-label font-semibold uppercase tracking-wider text-text-muted">
          Privacy
        </p>
        <div role="radiogroup" aria-label="Collection privacy">
          {PRIVACY_OPTIONS.map((opt) => {
            const selected = privacy === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPrivacy(opt.key)}
                className="pressable flex w-full items-center justify-between gap-3 border-b border-border-subtle py-3.5 text-left last:border-b-0"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Icon
                    name={opt.icon}
                    size={20}
                    className={selected ? 'text-text-primary' : 'text-text-muted'}
                  />
                  <span className="min-w-0">
                    <span className="block text-body-emphasis font-semibold text-text-primary">
                      {opt.title}
                    </span>
                    <span className="block text-meta text-text-muted">{opt.subtitle}</span>
                  </span>
                </span>
                {selected ? (
                  <Icon name="check" filled size={22} className="text-brand" />
                ) : (
                  <span className="h-[22px] w-[22px] rounded-full border border-border" aria-hidden />
                )}
              </button>
            );
          })}
        </div>

        <Button
          fullWidth
          size="lg"
          className="mt-5"
          disabled={!name.trim() || submitting}
          onClick={handleCreate}
        >
          Create collection
        </Button>
      </div>
    </Sheet>
  );
}
