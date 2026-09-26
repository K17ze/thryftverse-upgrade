'use client';

/**
 * PrivacyView — the /settings/privacy surface.
 *
 * Web deepening of the mobile PrivacySettingsScreen visibility switches,
 * BlockedUsersScreen and RestrictedAccountsScreen: profile-visibility
 * toggles plus a member lookup that resolves against the fixture USERS
 * directory (the same directory a real backend search would return).
 */

import { useMemo, useState } from 'react';
import { SettingsSection } from './SettingsSection';
import { Switch } from './Switch';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { USERS } from '@/lib/data/fixtures';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs, type PrivacyFlag } from '@/lib/store/settingsPrefs';

// ── Profile privacy switches ────────────────────────────────────────────────

const PRIVACY_SWITCHES: { key: PrivacyFlag; label: string; sub: string }[] = [
  {
    key: 'showCloset',
    label: 'Show my closet',
    sub: 'Members can browse your listings from your profile',
  },
  {
    key: 'showSaved',
    label: 'Show saved boards',
    sub: 'Your public collections and moodboards appear on your profile',
  },
  {
    key: 'allowMessages',
    label: 'Allow messages',
    sub: 'Members can start a chat with you from your profile or listings',
  },
  {
    key: 'showActivity',
    label: 'Activity status',
    sub: 'Show when you were last active',
  },
];

// ── Member lookup + list ────────────────────────────────────────────────────

interface MemberManagerProps {
  /** 'block' | 'restrict' — drives labels and copy. */
  kind: 'block' | 'restrict';
  ids: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  emptyText: string;
}

function MemberManager({ kind, ids, onAdd, onRemove, emptyText }: MemberManagerProps) {
  const { show } = useToast();
  const [query, setQuery] = useState('');

  const members = useMemo(
    () => ids.map((id) => USERS.find((u) => u.id === id)).filter((u) => u != null),
    [ids],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    if (!q) return [];
    return USERS.filter(
      (u) => u.id !== 'me' && !ids.includes(u.id) && u.username.toLowerCase().includes(q),
    ).slice(0, 4);
  }, [query, ids]);

  const verb = kind === 'block' ? 'Block' : 'Restrict';

  return (
    <div>
      <div className="px-4 pb-3 pt-3 sm:px-5">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${verb} a member — search username`}
          aria-label={`Search members to ${verb.toLowerCase()}`}
          className="h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
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
                  show(`@${u.username} ${kind === 'block' ? 'blocked' : 'restricted'}`, 'info');
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
                <p className="text-caption text-text-muted">
                  {kind === 'block'
                    ? 'Can’t message you, follow you or see your listings'
                    : 'Their messages go to requests — they aren’t told'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onRemove(u.id);
                  show(`@${u.username} ${kind === 'block' ? 'unblocked' : 'unrestricted'}`, 'info');
                }}
                className="pressable rounded-md px-2.5 py-1.5 text-caption font-semibold text-text-primary hover:bg-brand-subtle"
              >
                {kind === 'block' ? 'Unblock' : 'Unrestrict'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center px-5 py-8 text-center">
          <Icon name={kind === 'block' ? 'ban' : 'eyeOff'} size={24} className="text-text-muted" />
          <p className="mt-2.5 max-w-xs text-body text-text-secondary">{emptyText}</p>
        </div>
      )}
    </div>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export function PrivacyView() {
  const hydrated = useHydrated();
  const showCloset = useSettingsPrefs((s) => s.showCloset);
  const showSaved = useSettingsPrefs((s) => s.showSaved);
  const allowMessages = useSettingsPrefs((s) => s.allowMessages);
  const showActivity = useSettingsPrefs((s) => s.showActivity);
  const setPrivacyFlag = useSettingsPrefs((s) => s.setPrivacyFlag);
  const blockedIds = useSettingsPrefs((s) => s.blockedIds);
  const restrictedIds = useSettingsPrefs((s) => s.restrictedIds);
  const blockUser = useSettingsPrefs((s) => s.blockUser);
  const unblockUser = useSettingsPrefs((s) => s.unblockUser);
  const restrictUser = useSettingsPrefs((s) => s.restrictUser);
  const unrestrictUser = useSettingsPrefs((s) => s.unrestrictUser);

  const flagValues: Record<PrivacyFlag, boolean> = {
    showCloset,
    showSaved,
    allowMessages,
    showActivity,
  };

  return (
    <>
      <SettingsSection title="Profile">
        {hydrated ? (
          PRIVACY_SWITCHES.map((row) => (
            <div key={row.key} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-body-emphasis text-text-primary">{row.label}</p>
                <p className="clamp-1 text-caption text-text-muted">{row.sub}</p>
              </div>
              <Switch
                checked={flagValues[row.key]}
                onChange={(v) => setPrivacyFlag(row.key, v)}
                aria-label={row.label}
              />
            </div>
          ))
        ) : (
          <div aria-busy aria-label="Loading privacy settings">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[52px] w-full rounded-none" />
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={`Blocked users${hydrated && blockedIds.length > 0 ? ` · ${blockedIds.length}` : ''}`}>
        {hydrated ? (
          <MemberManager
            kind="block"
            ids={blockedIds}
            onAdd={blockUser}
            onRemove={unblockUser}
            emptyText="Nobody blocked. Blocked members can’t message you, follow you, or see your listings."
          />
        ) : (
          <Skeleton className="h-[52px] w-full rounded-none" />
        )}
      </SettingsSection>

      <SettingsSection title={`Restricted${hydrated && restrictedIds.length > 0 ? ` · ${restrictedIds.length}` : ''}`}>
        {hydrated ? (
          <MemberManager
            kind="restrict"
            ids={restrictedIds}
            onAdd={restrictUser}
            onRemove={unrestrictUser}
            emptyText="Nobody restricted. Restricted members can still see your profile, but their messages land in requests."
          />
        ) : (
          <Skeleton className="h-[52px] w-full rounded-none" />
        )}
      </SettingsSection>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        In this preview, lists are stored on this device. The platform enforces
        blocks server-side — messages, follows and listing visibility are
        filtered before they ever reach the other member.
      </p>
    </>
  );
}
