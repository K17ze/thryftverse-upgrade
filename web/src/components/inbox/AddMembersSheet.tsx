'use client';

/**
 * AddMembersSheet — the admin add-members flow behind the members
 * directory, a compact port of the mobile GroupMembers add section: search
 * the member directory, multi-select rows, confirm. Existing members are
 * filtered out before render, never just disabled.
 */

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@/lib/contracts/domain';
import { useMemberDirectory } from '@/lib/hooks/queries';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';

const MAX_ADD = 24;

export function AddMembersSheet({
  open,
  onClose,
  existingIds,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  existingIds: ReadonlySet<string>;
  /** Persist the picks — parent owns the toast + close on success. */
  onAdd: (users: User[]) => Promise<boolean>;
}) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<User[]>([]);
  const [adding, setAdding] = useState(false);
  const { data: directory, isLoading } = useMemberDirectory(q);

  useEffect(() => {
    if (open) {
      setQ('');
      setSelected([]);
      setAdding(false);
    }
  }, [open]);

  const candidates = useMemo(
    () => (directory ?? []).filter((u) => !existingIds.has(u.id)),
    [directory, existingIds],
  );
  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected]);

  const toggle = (u: User) =>
    setSelected((prev) =>
      prev.some((x) => x.id === u.id)
        ? prev.filter((x) => x.id !== u.id)
        : prev.length >= MAX_ADD
          ? prev
          : [...prev, u],
    );

  const confirm = async () => {
    if (selected.length === 0 || adding) return;
    setAdding(true);
    const ok = await onAdd(selected);
    setAdding(false);
    if (ok) onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add members" maxWidth={440}>
      <div className="flex h-[min(70dvh,520px)] flex-col">
        <div className="shrink-0 px-4 pb-2 pt-1">
          <label className="relative block">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
              <Icon name="search" size={16} />
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people"
              aria-label="Search people"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              className="h-10 w-full rounded-full border border-transparent bg-surface-alt pl-9 pr-3 text-body text-input-text placeholder:text-text-muted focus:border-border focus:outline-none"
            />
          </label>
        </div>

        {selected.length > 0 ? (
          <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-2">
            {selected.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u)}
                aria-label={`Remove ${u.username} from selection`}
                className="pressable flex shrink-0 items-center gap-1.5 rounded-full bg-surface-alt py-1 pl-1 pr-2.5"
              >
                <Avatar src={u.avatar} name={u.username} size={22} />
                <span className="max-w-[96px] truncate text-meta text-text-primary">
                  {u.username}
                </span>
                <Icon name="close" size={12} className="text-text-muted" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="mt-1.5 h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <p className="px-4 py-10 text-center text-body text-text-muted">
              {q.trim()
                ? 'No one found — try a different username.'
                : 'Everyone you know is already in this group.'}
            </p>
          ) : (
            candidates.map((u) => {
              const isSelected = selectedIds.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u)}
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? 'Deselect' : 'Select'} ${u.username}`}
                  className="pressable flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-row-pressed"
                >
                  <Avatar src={u.avatar} name={u.username} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                        {u.username}
                      </span>
                      {u.isVerified ? (
                        <Icon
                          name="verified"
                          filled
                          size={13}
                          className="shrink-0 text-commerce-trust"
                        />
                      ) : null}
                    </span>
                    {u.location ? (
                      <span className="clamp-1 block text-meta text-text-muted">{u.location}</span>
                    ) : null}
                  </span>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      isSelected
                        ? 'border-brand bg-brand text-text-inverse'
                        : 'border-border text-transparent'
                    }`}
                    aria-hidden
                  >
                    <Icon name="check" size={14} />
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-border-subtle px-4 py-3">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={selected.length === 0 || adding}
            onClick={confirm}
          >
            {adding
              ? 'Adding…'
              : selected.length === 0
                ? 'Select members'
                : `Add ${selected.length} ${selected.length === 1 ? 'member' : 'members'}`}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
