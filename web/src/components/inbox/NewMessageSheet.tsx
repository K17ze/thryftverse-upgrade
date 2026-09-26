'use client';

/**
 * NewMessageSheet — port of the mobile NewMessageScreen + CreateGroupChat
 * two-stage flow, folded into one sheet:
 *
 *   contacts → tap a person to open/create the DM; "Start group chat"
 *              quick action enters member select
 *   members  → search + chip rail + checkable rows, ≥2 members to continue
 *   details  → live mosaic preview, group name (required), optional
 *              description (280), member list, "Create group" CTA
 *
 * Creation goes through useCreateConversation — the query cache doubles as
 * the session store (same pattern as collections / support tickets).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/contracts/domain';
import {
  useConversations,
  useCreateConversation,
  useMemberDirectory,
  useUser,
} from '@/lib/hooks/queries';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { isGroupConversation } from './inboxModel';
import { GroupAvatarMosaic } from './GroupAvatarMosaic';

type Stage = 'contacts' | 'members' | 'details';

/** Group semantics need ≥2 other members — a single pick is just a DM. */
const MIN_GROUP_MEMBERS = 2;
const MAX_GROUP_MEMBERS = 48;
const MAX_DESCRIPTION = 280;

interface NewMessageSheetProps {
  open: boolean;
  onClose: () => void;
}

export function NewMessageSheet({ open, onClose }: NewMessageSheetProps) {
  const router = useRouter();
  const toast = useToast();
  const { data: conversations } = useConversations();
  const { data: me } = useUser('me');
  const createConversation = useCreateConversation();

  const [stage, setStage] = useState<Stage>('contacts');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<User[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [description, setDescription] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: directory, isLoading: directoryLoading } = useMemberDirectory(q);

  // Fresh draft each time the sheet opens.
  useEffect(() => {
    if (open) {
      setStage('contacts');
      setQ('');
      setSelected([]);
      setGroupTitle('');
      setDescription('');
    }
  }, [open]);

  // Existing 1:1 threads, in inbox order — the "Recent" contacts section.
  const recentContacts = useMemo(() => {
    const seen = new Set<string>();
    const out: { userId: string; name: string; avatar: string; verified?: boolean }[] = [];
    for (const c of conversations ?? []) {
      if (isGroupConversation(c) || !c.participantId || seen.has(c.participantId)) continue;
      seen.add(c.participantId);
      out.push({
        userId: c.participantId,
        name: c.participantName,
        avatar: c.participantAvatar,
        verified: c.participantVerified,
      });
    }
    return out;
  }, [conversations]);

  const existingDmIds = useMemo(
    () => new Set(recentContacts.map((c) => c.userId)),
    [recentContacts],
  );

  const query = q.trim();
  const directoryUsers = directory ?? [];
  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected]);
  const isCreating = createConversation.isPending;

  const toggleMember = (user: User) => {
    setSelected((prev) => {
      if (prev.some((u) => u.id === user.id)) return prev.filter((u) => u.id !== user.id);
      if (prev.length >= MAX_GROUP_MEMBERS) return prev;
      return [...prev, user];
    });
  };

  const openDm = (userId: string) => {
    createConversation.mutate(
      { memberIds: [userId] },
      {
        onSuccess: (c) => {
          onClose();
          router.push(`/inbox/${c.id}`);
        },
        onError: () => toast.show('Could not start conversation. Try again.', 'error'),
      },
    );
  };

  const createGroup = () => {
    createConversation.mutate(
      {
        memberIds: selected.map((u) => u.id),
        title: groupTitle.trim(),
        description: description.trim() || undefined,
      },
      {
        onSuccess: (c) => {
          onClose();
          toast.show('Group chat created', 'success');
          router.push(`/inbox/${c.id}`);
        },
        onError: () => toast.show('Could not create the group. Try again.', 'error'),
      },
    );
  };

  const sheetTitle =
    stage === 'contacts' ? 'New message' : stage === 'members' ? 'New group' : 'Group details';

  return (
    <Sheet open={open} onClose={onClose} title={sheetTitle} maxWidth={440}>
      <div className="flex h-[min(70dvh,560px)] flex-col">
        {/* Stage back navigation — the sheet header owns title/close only. */}
        {stage !== 'contacts' ? (
          <div className="flex shrink-0 items-center px-1 pt-1">
            <IconButton
              name="back"
              aria-label={stage === 'members' ? 'Back to contacts' : 'Back to member selection'}
              onClick={() => setStage(stage === 'details' ? 'members' : 'contacts')}
            />
          </div>
        ) : null}

        {stage !== 'details' ? (
          <>
            {/* Search */}
            <div className="shrink-0 px-4 pb-2 pt-1">
              <label className="relative block">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                  <Icon name="search" size={16} />
                </span>
                <input
                  ref={searchRef}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={
                    stage === 'members' ? 'Search people' : 'Search by name or username'
                  }
                  aria-label="Search people"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="h-10 w-full rounded-full border border-transparent bg-surface-alt pl-9 pr-3 text-body text-input-text placeholder:text-text-muted focus:border-border focus:outline-none"
                />
              </label>
            </div>

            {/* Selected chip rail (member stage) */}
            {stage === 'members' && selected.length > 0 ? (
              <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-2">
                {selected.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleMember(u)}
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
              {/* Quick action — group entry point, hidden while searching */}
              {stage === 'contacts' && !query ? (
                <button
                  type="button"
                  onClick={() => setStage('members')}
                  className="pressable flex w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-left"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtle text-brand">
                    <Icon name="people" size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-emphasis font-semibold text-text-primary">
                      Start group chat
                    </span>
                    <span className="block text-meta text-text-muted">
                      Create a group with multiple people
                    </span>
                  </span>
                  <Icon name="forward" size={16} className="text-text-muted" />
                </button>
              ) : null}

              {stage === 'contacts' ? (
                query ? (
                  <UserResultList
                    users={directoryUsers}
                    loading={directoryLoading}
                    existingIds={existingDmIds}
                    onPick={(u) => openDm(u.id)}
                    disabled={isCreating}
                  />
                ) : (
                  <div>
                    <p className="px-4 pb-1 pt-3 text-meta font-semibold uppercase tracking-wide text-text-muted">
                      Recent
                    </p>
                    {recentContacts.length === 0 ? (
                      <p className="px-4 py-6 text-body text-text-muted">
                        No recent conversations — search for someone to message.
                      </p>
                    ) : (
                      recentContacts.map((c) => (
                        <button
                          key={c.userId}
                          type="button"
                          disabled={isCreating}
                          onClick={() => openDm(c.userId)}
                          aria-label={`Message ${c.name}`}
                          className="pressable flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-row-pressed"
                        >
                          <Avatar src={c.avatar} name={c.name} size={40} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1">
                              <span className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                                {c.name}
                              </span>
                              {c.verified ? (
                                <Icon name="verified" filled size={13} className="shrink-0 text-commerce-trust" />
                              ) : null}
                            </span>
                            <span className="block text-meta text-text-muted">
                              Existing conversation
                            </span>
                          </span>
                          <Icon name="forward" size={16} className="text-text-muted" />
                        </button>
                      ))
                    )}
                  </div>
                )
              ) : (
                <>
                  {directoryLoading ? (
                    <MemberListSkeleton />
                  ) : directoryUsers.length === 0 ? (
                    <p className="px-4 py-10 text-center text-body text-text-muted">
                      {query ? 'No one found — try a different username.' : 'No people to add.'}
                    </p>
                  ) : (
                    directoryUsers.map((u) => {
                      const isSelected = selectedIds.has(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleMember(u)}
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
                                <Icon name="verified" filled size={13} className="shrink-0 text-commerce-trust" />
                              ) : null}
                            </span>
                            <span className="clamp-1 block text-meta text-text-muted">
                              {u.location}
                            </span>
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
                </>
              )}
            </div>

            {/* Member-stage footer */}
            {stage === 'members' ? (
              <div className="shrink-0 border-t border-border-subtle px-4 py-3">
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={selected.length < MIN_GROUP_MEMBERS}
                  onClick={() => setStage('details')}
                >
                  {selected.length === 0
                    ? 'Select members'
                    : selected.length < MIN_GROUP_MEMBERS
                      ? 'Select at least 2 members'
                      : `Continue · ${selected.length} selected`}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          /* ── Details stage: mosaic preview + name/description + members ── */
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex flex-col items-center px-4 pb-2 pt-4">
                <GroupAvatarMosaic
                  members={selected.map((u) => ({
                    id: u.id,
                    displayName: u.username,
                    avatar: u.avatar,
                  }))}
                  size={88}
                  fallbackName={groupTitle.trim() || 'Group'}
                  groupId="new-group"
                />
                <p className="mt-2 text-meta text-text-muted">
                  Mosaic is built from the members — a photo can be added later
                </p>
              </div>

              <div className="px-4 pb-2 pt-2">
                <label className="block">
                  <span className="mb-1.5 block text-meta font-semibold uppercase tracking-wide text-text-muted">
                    Group name
                  </span>
                  <input
                    type="text"
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    placeholder="Group name"
                    aria-label="Group name"
                    maxLength={80}
                    autoFocus
                    className="h-11 w-full rounded-lg border border-border bg-surface-alt px-3 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
                  />
                </label>
              </div>

              <div className="px-4 pb-2 pt-1">
                <label className="block">
                  <span className="mb-1.5 block text-meta font-semibold uppercase tracking-wide text-text-muted">
                    Description (optional)
                  </span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this group about?"
                    aria-label="Group description"
                    maxLength={MAX_DESCRIPTION}
                    rows={2}
                    className="w-full resize-none rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
                  />
                </label>
                <p className="mt-1 text-right text-meta text-text-muted">
                  {description.length}/{MAX_DESCRIPTION}
                </p>
              </div>

              <div className="px-4 pb-4 pt-1">
                <p className="mb-1.5 text-meta font-semibold uppercase tracking-wide text-text-muted">
                  {selected.length + 1} members
                </p>
                {selected.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 py-2">
                    <Avatar src={u.avatar} name={u.username} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                          {u.username}
                        </span>
                        {u.isVerified ? (
                          <Icon name="verified" filled size={13} className="shrink-0 text-commerce-trust" />
                        ) : null}
                      </span>
                      <span className="clamp-1 block text-meta text-text-muted">{u.location}</span>
                    </span>
                    <IconButton
                      name="close"
                      size={16}
                      aria-label={`Remove ${u.username}`}
                      className="h-8 w-8"
                      onClick={() => toggleMember(u)}
                    />
                  </div>
                ))}
                <p className="mt-1 flex items-center gap-3 py-2 text-body text-text-secondary">
                  <Avatar src={me?.avatar} name="You" size={36} />
                  <span className="text-body-emphasis font-semibold text-text-primary">You</span>
                  <span className="text-meta text-text-muted">owner</span>
                </p>
              </div>
            </div>

            <div className="shrink-0 border-t border-border-subtle px-4 py-3">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={!groupTitle.trim() || selected.length < MIN_GROUP_MEMBERS || isCreating}
                onClick={createGroup}
              >
                {isCreating ? 'Creating…' : 'Create group'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Directory search results — rows open or create a DM. */
function UserResultList({
  users,
  loading,
  existingIds,
  onPick,
  disabled,
}: {
  users: User[];
  loading: boolean;
  existingIds: ReadonlySet<string>;
  onPick: (u: User) => void;
  disabled: boolean;
}) {
  if (loading) return <MemberListSkeleton />;
  if (users.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-body text-text-muted">
        No one found — try a different username.
      </p>
    );
  }
  return (
    <div>
      {users.map((u) => (
        <button
          key={u.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(u)}
          aria-label={`Message ${u.username}`}
          className="pressable flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-row-pressed"
        >
          <Avatar src={u.avatar} name={u.username} size={40} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span className="clamp-1 text-body-emphasis font-semibold text-text-primary">
                {u.username}
              </span>
              {u.isVerified ? (
                <Icon name="verified" filled size={13} className="shrink-0 text-commerce-trust" />
              ) : null}
            </span>
            <span className="clamp-1 block text-meta text-text-muted">
              {existingIds.has(u.id) ? 'Existing conversation' : u.location}
            </span>
          </span>
          <Icon name="forward" size={16} className="text-text-muted" />
        </button>
      ))}
    </div>
  );
}

function MemberListSkeleton() {
  return (
    <div className="px-4" aria-busy aria-label="Loading people">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="mt-1.5 h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
