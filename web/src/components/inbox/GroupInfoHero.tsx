'use client';

/**
 * GroupInfoHero — the group identity header for the info surface, ported
 * from mobile: an optional full-width cover banner owns the first viewport
 * with the mosaic overlapping it; without a cover the avatar stands alone.
 * Edit affordances only render for members with the edit-group-info
 * capability — containment is reserved for meaning, so each badge is a
 * small camera target on the media itself, not a chrome circle.
 */

import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import type { Conversation } from '@/lib/contracts/domain';
import { GroupAvatarMosaic } from './GroupAvatarMosaic';
import { memberCount, mosaicMembers } from './inboxModel';

const isLocalUri = (uri: string) => uri.startsWith('blob:') || uri.startsWith('data:');

export function GroupInfoHero({
  conversation,
  canEdit,
  onEditCover,
  onEditAvatar,
  onEditDescription,
  onEditInfo,
}: {
  conversation: Conversation;
  canEdit: boolean;
  onEditCover: () => void;
  onEditAvatar: () => void;
  onEditDescription: () => void;
  /** Opens the full edit sheet (title row affordance). */
  onEditInfo: () => void;
}) {
  const title = conversation.title || 'Group chat';
  const members = memberCount(conversation);
  const cover = conversation.coverPhoto;

  const mosaic = (
    <div className="relative">
      <GroupAvatarMosaic
        members={mosaicMembers(conversation)}
        size={cover ? 96 : 104}
        groupPhoto={conversation.avatar}
        fallbackName={title}
        groupId={conversation.id}
        className={cover ? 'ring-4 ring-background' : ''}
      />
      {canEdit ? (
        <button
          type="button"
          onClick={onEditAvatar}
          aria-label="Change group photo"
          className="pressable absolute bottom-0.5 right-0.5 flex h-[30px] w-[30px] items-center justify-center rounded-full border-[2.5px] border-background bg-brand text-text-inverse"
        >
          <Icon name="camera" size={14} filled />
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      {cover ? (
        <div className="relative">
          <div className="relative h-44 w-full overflow-hidden bg-surface-alt">
            {isLocalUri(cover) ? (
              // eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable
              <img src={cover} alt="Group cover" className="h-full w-full object-cover" />
            ) : (
              <AppImage
                src={cover}
                alt="Group cover"
                fill
                sizes="(max-width: 768px) 100vw, 360px"
                className="h-full w-full"
                fallbackIcon="images"
              />
            )}
            {canEdit ? (
              <button
                type="button"
                onClick={onEditCover}
                aria-label="Change cover photo"
                className="pressable absolute bottom-2.5 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-overlay text-scrim-text-primary"
              >
                <Icon name="camera" size={17} />
              </button>
            ) : null}
          </div>
          <div className="-mt-12 mb-1 flex justify-center">{mosaic}</div>
        </div>
      ) : (
        <div className="flex justify-center pb-1 pt-6">{mosaic}</div>
      )}

      <div className="flex flex-col items-center gap-1 px-4">
        <div className="flex max-w-full items-center gap-2">
          <h1 className="clamp-1 max-w-full text-center text-screen-title font-bold text-text-primary">
            {title}
          </h1>
          {canEdit ? (
            <button
              type="button"
              onClick={onEditInfo}
              aria-label="Edit group"
              className="pressable -mr-1 flex h-8 w-8 shrink-0 items-center justify-center text-text-muted"
            >
              <Icon name="edit" size={16} />
            </button>
          ) : null}
        </div>
        <p className="text-body font-medium text-text-secondary">
          Group · {members} {members === 1 ? 'member' : 'members'}
        </p>
        {conversation.description ? (
          <button
            type="button"
            onClick={canEdit ? onEditDescription : undefined}
            aria-label="Group description"
            className={`clamp-2 mt-1 max-w-[85%] text-center text-meta leading-relaxed text-text-secondary ${
              canEdit ? 'pressable' : 'cursor-default'
            }`}
          >
            {conversation.description}
            {canEdit ? <span className="ml-1 text-text-muted">Edit</span> : null}
          </button>
        ) : canEdit ? (
          <button
            type="button"
            onClick={onEditDescription}
            aria-label="Add group description"
            className="pressable mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-subtle px-2.5 py-1 text-meta font-medium text-brand"
          >
            <Icon name="plus" size={12} />
            Add group description
          </button>
        ) : null}
      </div>
    </>
  );
}
