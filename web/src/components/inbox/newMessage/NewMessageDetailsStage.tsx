'use client';

import type { User } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { GroupAvatarMosaic } from '../GroupAvatarMosaic';
import { MAX_DESCRIPTION, MIN_GROUP_MEMBERS } from './useNewMessageWorkflow';

interface NewMessageDetailsStageProps {
  selected: User[];
  groupTitle: string;
  onGroupTitleChange: (val: string) => void;
  description: string;
  onDescriptionChange: (val: string) => void;
  onToggleMember: (user: User) => void;
  user: User | null;
  isCreating: boolean;
  onCreateGroup: () => void;
}

export function NewMessageDetailsStage({
  selected,
  groupTitle,
  onGroupTitleChange,
  description,
  onDescriptionChange,
  onToggleMember,
  user,
  isCreating,
  onCreateGroup,
}: NewMessageDetailsStageProps) {
  return (
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
              onChange={(e) => onGroupTitleChange(e.target.value)}
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
              onChange={(e) => onDescriptionChange(e.target.value)}
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
                className="relative h-8 w-8 after:absolute after:-inset-1.5 after:content-['']"
                onClick={() => onToggleMember(u)}
              />
            </div>
          ))}
          <p className="mt-1 flex items-center gap-3 py-2 text-body text-text-secondary">
            <Avatar src={user?.avatar} name="You" size={36} />
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
          onClick={onCreateGroup}
        >
          {isCreating ? 'Creating…' : 'Create group'}
        </Button>
      </div>
    </>
  );
}
