'use client';

/**
 * EditGroupSheet — the group identity editor (name, description, group
 * photo, cover) behind the edit-permission gate, ported from the mobile
 * EditGroupScreen fields. Media picks stage local object-URL drafts — a
 * fixture-mode upload — so a pick only persists on Save. Closing with a
 * dirty draft raises the shared discard confirmation.
 */

import { useEffect, useRef, useState } from 'react';
import type { Conversation } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { GroupAvatarMosaic } from './GroupAvatarMosaic';
import { mosaicMembers } from './inboxModel';

const MAX_NAME = 80;
const MAX_DESCRIPTION = 280;

/** blob:/data: URIs come from the local file picker — next/image can't
 *  optimize them, same guard as MessageBubble. */
const isLocalUri = (uri: string) => uri.startsWith('blob:') || uri.startsWith('data:');

export function EditGroupSheet({
  open,
  onClose,
  conversation,
  onSave,
  onDiscardDirty,
}: {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  /** Persist the identity patch — returns success. */
  onSave: (patch: {
    title: string;
    description: string;
    avatar?: string | null;
    coverPhoto?: string | null;
  }) => Promise<boolean>;
  /** Called instead of onClose when the draft is dirty — the parent owns
   *  the discard-confirmation sheet so it composes with its confirm state. */
  onDiscardDirty: () => void;
}) {
  const [name, setName] = useState(conversation.title ?? '');
  const [description, setDescription] = useState(conversation.description ?? '');
  /** undefined = unchanged, null = removed, string = new/staged uri */
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [cover, setCover] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const stagedUrls = useRef<Set<string>>(new Set());

  // Fresh draft each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setName(conversation.title ?? '');
    setDescription(conversation.description ?? '');
    setAvatar(undefined);
    setCover(undefined);
    setSaving(false);
  }, [open, conversation]);

  // Release staged object URLs on unmount.
  useEffect(() => {
    const urls = stagedUrls.current;
    return () => urls.forEach((uri) => URL.revokeObjectURL(uri));
  }, []);

  const pick = (target: 'avatar' | 'cover') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const uri = URL.createObjectURL(file);
    stagedUrls.current.add(uri);
    if (target === 'avatar') setAvatar(uri);
    else setCover(uri);
  };

  const dirty =
    name !== (conversation.title ?? '') ||
    description !== (conversation.description ?? '') ||
    avatar !== undefined ||
    cover !== undefined;

  const requestClose = () => {
    if (dirty && !saving) {
      onDiscardDirty();
      return;
    }
    onClose();
  };

  const displayAvatar = avatar === undefined ? conversation.avatar : (avatar ?? undefined);
  const displayCover = cover === undefined ? conversation.coverPhoto : (cover ?? undefined);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const ok = await onSave({
      title: name.trim(),
      description: description.trim(),
      ...(avatar !== undefined ? { avatar } : {}),
      ...(cover !== undefined ? { coverPhoto: cover } : {}),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Sheet open={open} onClose={requestClose} title="Edit group" maxWidth={440}>
      <div className="px-5 pb-6">
        {/* ── Identity media ── */}
        <div className="flex items-start gap-4 pb-4">
          <div className="relative shrink-0">
            <GroupAvatarMosaic
              members={mosaicMembers(conversation)}
              size={72}
              groupPhoto={displayAvatar}
              fallbackName={name.trim() || 'Group'}
              groupId={conversation.id}
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              aria-label="Change group photo"
              className="pressable absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-brand text-text-inverse"
            >
              <Icon name="camera" size={13} filled />
            </button>
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-body font-medium text-text-primary">Group photo</p>
            <p className="mt-0.5 text-meta text-text-muted">
              Shown instead of the member mosaic.
            </p>
            {displayAvatar ? (
              <button
                type="button"
                onClick={() => setAvatar(null)}
                className="pressable mt-1.5 text-meta font-semibold text-danger-text"
              >
                Remove photo
              </button>
            ) : null}
          </div>
        </div>

        <div className="pb-4">
          <p className="text-body font-medium text-text-primary">Cover photo</p>
          {displayCover ? (
            <div className="relative mt-1.5">
              {isLocalUri(displayCover) ? (
                // eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable
                <img
                  src={displayCover}
                  alt="Group cover"
                  className="h-24 w-full rounded-lg object-cover"
                />
              ) : (
                <AppImage
                  src={displayCover}
                  alt="Group cover"
                  sizes="400px"
                  className="h-24 w-full rounded-lg"
                />
              )}
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                aria-label="Change cover photo"
                className="pressable absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-overlay text-scrim-text-primary"
              >
                <Icon name="camera" size={15} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="pressable mt-1.5 flex h-24 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-text-muted"
            >
              <Icon name="camera" size={18} />
              <span className="text-meta font-medium">Add a cover photo</span>
            </button>
          )}
          {displayCover ? (
            <button
              type="button"
              onClick={() => setCover(null)}
              className="pressable mt-1.5 text-meta font-semibold text-danger-text"
            >
              Remove cover
            </button>
          ) : null}
        </div>

        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={pick('avatar')}
        />
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={pick('cover')}
        />

        {/* ── Identity fields ── */}
        <label className="block border-t border-border-subtle pt-4">
          <span className="mb-1.5 block text-meta font-semibold uppercase tracking-wide text-text-muted">
            Group name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            aria-label="Group name"
            maxLength={MAX_NAME}
            className="h-11 w-full rounded-lg border border-border bg-surface-alt px-3 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
          />
        </label>

        <label className="mt-4 block">
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
          <span className="mt-1 block text-right text-meta text-text-muted">
            {description.length}/{MAX_DESCRIPTION}
          </span>
        </label>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!name.trim() || !dirty || saving}
          onClick={save}
          className="mt-3"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Sheet>
  );
}
