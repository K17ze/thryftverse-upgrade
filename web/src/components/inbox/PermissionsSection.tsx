'use client';

/**
 * PermissionsSection — the group governance rows, a 1:1 port of the mobile
 * GroupPermissionsScreen grammar: each permission expands to a description
 * and an Everyone / Admins-only scope control. Managers edit in place;
 * everyone else gets the read-only honest render with the footer note.
 */

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type {
  EditablePermission,
  GroupCapabilities,
  GroupPermissionScope,
  GroupSettings,
} from './groupAdmin';

const PERMISSIONS: Array<{
  key: EditablePermission;
  title: string;
  description: string;
}> = [
  {
    key: 'editGroupInfo',
    title: 'Edit group info',
    description: 'Change the name, description and group photo.',
  },
  {
    key: 'sendMessages',
    title: 'Send messages',
    description: 'Choose whether the group is collaborative or announcement-only.',
  },
  {
    key: 'addMembers',
    title: 'Add and invite members',
    description: 'Add people directly or create a group invite link.',
  },
];

export function PermissionsSection({
  settings,
  capabilities,
  pendingKey,
  onChange,
}: {
  settings: GroupSettings;
  capabilities: GroupCapabilities;
  /** Permission currently persisting — its control shows a spinner. */
  pendingKey?: EditablePermission | null;
  onChange: (key: EditablePermission, scope: GroupPermissionScope) => void;
}) {
  const [expandedKey, setExpandedKey] = useState<EditablePermission | null>(null);

  return (
    <section className="mt-6">
      <h2 className="px-4 pb-1.5 text-meta font-semibold uppercase tracking-wide text-text-muted">
        Permissions
      </h2>
      <div className="border-y border-border-subtle">
        {PERMISSIONS.map((permission, index) => {
          const expanded = expandedKey === permission.key;
          const scope = settings[permission.key];
          return (
            <div
              key={permission.key}
              className={index > 0 ? 'border-t border-border-subtle' : undefined}
            >
              <button
                type="button"
                onClick={() => setExpandedKey(expanded ? null : permission.key)}
                aria-expanded={expanded}
                aria-label={`${permission.title}, ${scope === 'everyone' ? 'Everyone' : 'Admins only'}`}
                className="pressable flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-text-primary">
                    {permission.title}
                  </span>
                  <span className="mt-0.5 block text-meta text-text-muted">
                    {scope === 'everyone' ? 'Everyone' : 'Admins only'}
                  </span>
                </span>
                {pendingKey === permission.key ? (
                  <span
                    className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-text-primary"
                    aria-label="Saving"
                  />
                ) : (
                  <Icon
                    name={expanded ? 'chevronUp' : 'chevronDown'}
                    size={18}
                    className="shrink-0 text-text-muted"
                  />
                )}
              </button>

              {expanded ? (
                <div className="px-4 pb-4">
                  <p className="text-meta leading-relaxed text-text-muted">
                    {permission.description}
                  </p>
                  <div className="mt-2" role="radiogroup" aria-label={permission.title}>
                    {(['everyone', 'admins'] as const).map((option) => {
                      const selected = scope === option;
                      const disabled = !capabilities.canManage || pendingKey != null;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={disabled}
                          onClick={() => onChange(permission.key, option)}
                          className={`flex min-h-[44px] w-full items-center justify-between px-2 py-2 text-left ${
                            selected ? 'bg-surface-alt' : ''
                          } ${disabled ? 'opacity-55' : 'pressable'}`}
                        >
                          <span
                            className={`text-body-emphasis font-semibold ${
                              selected ? 'text-text-primary' : 'text-text-muted'
                            }`}
                          >
                            {option === 'everyone' ? 'Everyone' : 'Admins only'}
                          </span>
                          {selected ? (
                            <Icon name="check" size={18} className="text-text-primary" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {!capabilities.canManage ? (
        <p className="px-4 pt-3 text-meta text-text-muted">
          Only an owner or admin can change these permissions.
        </p>
      ) : null}
    </section>
  );
}
