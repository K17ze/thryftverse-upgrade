'use client';

/**
 * CreateBoardSheet — the "New board" path for owner board surfaces. One
 * sheet, two kinds: Collection → useCollectionActions (POST /collections
 * live; session store + resolvable fixture row in demo) — Moodboard →
 * POST /moodboards live, persisted boardPrefs row in demo so every
 * surface (grid, save sheet, detail route) resolves it for the session.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { Switch } from '@/components/settings/Switch';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import { useCollectionActions } from '@/lib/hooks/collections-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useBoardPrefs } from '@/components/profile/boardPrefs';

type BoardKind = 'collection' | 'moodboard';

interface CreateBoardSheetProps {
  open: boolean;
  onClose: () => void;
}

export function CreateBoardSheet({ open, onClose }: CreateBoardSheetProps) {
  const router = useRouter();
  const { show } = useToast();
  const { user } = useSession();
  const { createCollection } = useCollectionActions();
  const addMoodboard = useBoardPrefs((s) => s.addMoodboard);

  const [kind, setKind] = useState<BoardKind>('collection');
  const [title, setTitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setKind('collection');
    setTitle('');
    setIsPrivate(false);
  };

  const create = async () => {
    const name = title.trim();
    if (!name || busy || !user) return;
    setBusy(true);
    try {
      if (kind === 'collection') {
        const created = await createCollection({ name, isPrivate });
        reset();
        onClose();
        show('Collection created', 'success');
        router.push(`/collection/${created.id}`);
      } else {
        const id =
          DATA_MODE === 'live'
            ? (await socialService.createMoodboard({
                title: name,
                visibility: isPrivate ? 'private' : 'public',
              })).id
            : `mb-web-${Date.now().toString(36)}`;
        addMoodboard({
          id,
          ownerId: user.id,
          title: name,
          kind: 'moodboard',
          itemIds: [],
          isPrivate,
          createdAt: new Date().toISOString(),
        });
        reset();
        onClose();
        show('Moodboard created', 'success');
        router.push(`/moodboard/${id}`);
      }
    } catch {
      show('Could not create the board', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New board" maxWidth={420}>
      <div className="px-5 pb-6">
        {/* Kind pick — two honest paths, both backed by real writes */}
        <div className="flex gap-2" role="radiogroup" aria-label="Board kind">
          {(
            [
              { key: 'collection', label: 'Collection', icon: 'layers' },
              { key: 'moodboard', label: 'Moodboard', icon: 'images' },
            ] as const
          ).map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              onClick={() => setKind(k.key)}
              className={`pressable flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border text-body font-semibold ${
                kind === k.key
                  ? 'border-brand bg-brand-subtle text-text-primary'
                  : 'border-border text-text-secondary'
              }`}
            >
              <Icon name={k.icon} size={17} />
              {k.label}
            </button>
          ))}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create();
          }}
          placeholder={kind === 'collection' ? 'Collection name' : 'Moodboard name'}
          aria-label="Board name"
          maxLength={60}
          autoFocus
          className="mt-4 h-11 w-full rounded-lg bg-surface-alt px-3.5 text-body text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
        />

        <div className="mt-3 flex items-center justify-between py-1">
          <span className="flex items-center gap-2 text-body text-text-primary">
            <Icon name="lock" size={16} className="text-text-muted" />
            Private board
          </span>
          <Switch
            checked={isPrivate}
            onChange={setIsPrivate}
            aria-label="Make board private"
          />
        </div>
        {isPrivate ? (
          <p className="text-meta text-text-muted">
            Only you can see private boards.
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!title.trim() || busy}
            onClick={() => void create()}
          >
            Create
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
