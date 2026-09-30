'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { USERS } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { searchUsers } from '@/lib/api/services/users';
import { useResolvedUsers } from '@/lib/hooks/home-modules';
import { useSession } from '@/lib/session/SessionProvider';

const LIVE = DATA_MODE === 'live';

export interface MemberManagerProps {
  /** 'block' | 'restrict' | 'mute' — drives labels and copy. */
  kind: 'block' | 'restrict' | 'mute';
  ids: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  emptyText: string;
}

const KIND_COPY: Record<
  MemberManagerProps['kind'],
  { verb: string; did: string; undid: string; removeVerb: string; rowSub: string; emptyIcon: 'ban' | 'eyeOff' | 'notificationsOff' }
> = {
  block: {
    verb: 'Block',
    did: 'blocked',
    undid: 'unblocked',
    removeVerb: 'Unblock',
    rowSub: 'Can’t message you, follow you or see your listings',
    emptyIcon: 'ban',
  },
  restrict: {
    verb: 'Restrict',
    did: 'restricted',
    undid: 'unrestricted',
    removeVerb: 'Unrestrict',
    rowSub: 'Their messages go to requests — they aren’t told',
    emptyIcon: 'eyeOff',
  },
  mute: {
    verb: 'Mute',
    did: 'muted',
    undid: 'unmuted',
    removeVerb: 'Unmute',
    rowSub: 'Their message notifications go quiet — they aren’t told',
    emptyIcon: 'notificationsOff',
  },
};

export function MemberManager({ kind, ids, onAdd, onRemove, emptyText }: MemberManagerProps) {
  const { show } = useToast();
  const { user } = useSession();
  const [query, setQuery] = useState('');
  const deferredQ = useDeferredValue(query.trim().toLowerCase().replace(/^@/, ''));

  // Member rows resolve through the shared user resolver — live ids
  // fetch real profiles, misses drop; fixture ids read USERS.
  const { items: resolvedMembers } = useResolvedUsers(ids);

  // Live member search — the real directory, not the fixture pool.
  const searchQuery = useQuery({
    queryKey: ['privacy-member-search', deferredQ],
    queryFn: ({ signal }) => searchUsers(deferredQ, signal),
    enabled: LIVE && deferredQ.length > 0,
    staleTime: 30_000,
  });

  const members = useMemo(() => {
    if (LIVE) return resolvedMembers;
    return ids.map((id) => USERS.find((u) => u.id === id)).filter((u) => u != null);
  }, [resolvedMembers, ids]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    if (!q) return [];
    if (LIVE) {
      return (searchQuery.data ?? [])
        .filter((u) => u.id !== user?.id && !ids.includes(u.id))
        .slice(0, 4);
    }
    return USERS.filter(
      (u) => u.id !== 'me' && !ids.includes(u.id) && u.username.toLowerCase().includes(q),
    ).slice(0, 4);
  }, [query, ids, searchQuery.data, user?.id]);

  const copy = KIND_COPY[kind];
  const verb = copy.verb;

  return (
    <div>
      <div className="px-4 pb-3 pt-3 sm:px-5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${verb} a member — search username`}
          aria-label={`Search members to ${verb.toLowerCase()}`}
          className="h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none lg:max-w-[440px]"
        />
      </div>

      {matches.length > 0 ? (
        <ul className="divide-y divide-border-subtle border-b border-border-subtle">
          {matches.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <Avatar src={u.avatar} name={u.username} size={36} />
              <span className="min-w-0 flex-1 clamp-1 text-body-emphasis text-text-primary">
                @{u.username}
              </span>
              <button
                type="button"
                onClick={() => {
                  onAdd(u.id);
                  setQuery('');
                  show(`@${u.username} ${copy.did}`, 'info');
                }}
                className="pressable rounded-md px-2.5 py-1.5 text-caption font-semibold text-danger-text hover:bg-danger-subtle"
              >
                {verb}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {members.length > 0 ? (
        <ul className="divide-y divide-border-subtle">
          {members.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar src={u.avatar} name={u.username} size={36} />
              <div className="min-w-0 flex-1">
                <p className="clamp-1 text-body-emphasis text-text-primary">@{u.username}</p>
                <p className="text-caption text-text-muted">{copy.rowSub}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onRemove(u.id);
                  show(`@${u.username} ${copy.undid}`, 'info');
                }}
                className="pressable rounded-md px-2.5 py-1.5 text-caption font-semibold text-text-primary hover:bg-brand-subtle"
              >
                {copy.removeVerb}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center px-5 py-8 text-center">
          <Icon name={copy.emptyIcon} size={24} className="text-text-muted" />
          <p className="mt-2.5 max-w-xs text-body text-text-secondary">{emptyText}</p>
        </div>
      )}
    </div>
  );
}
