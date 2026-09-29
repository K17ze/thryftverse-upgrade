'use client';

/**
 * LookComposer — web authoring for a look: media cover, title, caption,
 * audience, shoppable listing tags.
 *
 * Writes (backend-verified contracts):
 *  - new draft  → POST /looks { status:'draft' }     (finalization required)
 *  - resume     → PATCH /looks/:id                    (media fields only sent
 *                when re-staged — unchanged media skips re-verification)
 *  - publish    → same bodies with status:'published'
 * Publish navigates to /look/[id].
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import type { LookDraft, LookTagInput, LookVisibility } from '@/lib/api/services/creator';
import * as creator from '@/lib/api/services/creator';
import { parseApiError } from '@/lib/api/http';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SellField, INPUT_CLASS, INPUT_ERROR_CLASS } from '@/components/sell/SellField';
import { useToast } from '@/components/ui/Toast';
import { MediaField, useStagedMedia } from './MediaField';
import { TagSheet } from './TagSheet';

interface LookComposerProps {
  /** Resumed server draft — PATCH path; absent = new POST. */
  draft?: LookDraft;
  /** Called after a draft save so the entry screen's list refreshes. */
  onDraftSaved: () => void;
  onBack: () => void;
}

type Pending = 'publish' | 'draft' | null;

interface LookErrors {
  media?: string;
  title?: string;
  submit?: string;
}

/** Deterministic pin layout: tags sit on a single row near the bottom of
 *  the frame, evenly spread — positions are fractions the detail surface
 *  can re-render against any crop. */
function tagPosition(index: number, total: number): { x: number; y: number } {
  const cols = Math.min(Math.max(total, 1), 3);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: (col + 1) / (cols + 1),
    y: Math.min(0.9, 0.72 + row * 0.12),
  };
}

export function LookComposer({ draft, onDraftSaved, onBack }: LookComposerProps) {
  const router = useRouter();
  const toast = useToast();
  const { media, seed, pick, clear } = useStagedMedia('look');

  const [title, setTitle] = useState(draft?.title ?? '');
  const [caption, setCaption] = useState(draft?.caption ?? '');
  const [visibility, setVisibility] = useState<LookVisibility>(draft?.visibility ?? 'public');
  const [tags, setTags] = useState<LookTagInput[]>(draft?.tags ?? []);
  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const [errors, setErrors] = useState<LookErrors>({});
  const [pending, setPending] = useState<Pending>(null);
  const seededRef = useRef(false);

  // Seed the resumed draft's media once — a user pick afterwards replaces it.
  useEffect(() => {
    if (draft && !seededRef.current) {
      seededRef.current = true;
      seed(draft.mediaUrl, draft.mediaType);
    }
  }, [draft, seed]);

  const busy = pending !== null || media?.uploading === true;

  const toggleTag = (listing: Listing) => {
    setTags((current) => {
      const exists = current.some((t) => t.listingId === listing.id);
      if (exists) return current.filter((t) => t.listingId !== listing.id);
      const next = [...current, { id: `t${current.length}`, listingId: listing.id, label: listing.title, x: 0.5, y: 0.8 }];
      // Re-layout all pins so spacing stays even as the set changes.
      return next.map((t, i) => ({ ...t, id: `t${i}`, ...tagPosition(i, next.length) }));
    });
    setErrors((e) => (e.media ? { ...e, media: undefined } : e));
  };

  const removeTag = (tagId: string) => {
    setTags((current) => {
      const next = current.filter((t) => t.id !== tagId);
      return next.map((t, i) => ({ ...t, id: `t${i}`, ...tagPosition(i, next.length) }));
    });
  };

  const validate = (): LookErrors => {
    const e: LookErrors = {};
    if (!media) {
      e.media = draft ? 'Keep the draft media or add a new one' : 'Add a photo or video';
    } else if (!media.receipt && !draft) {
      e.media = media.uploading ? 'Wait for the upload to finish' : 'Re-add the media — the upload didn’t finish';
    }
    if (title.trim().length > 120) e.title = 'Keep the title under 120 characters';
    return e;
  };

  const submit = async (status: 'published' | 'draft') => {
    const next = validate();
    setErrors(next);
    if (next.media || next.title) return;
    setPending(status === 'published' ? 'publish' : 'draft');

    const mediaFields = media?.receipt
      ? {
          mediaUrl: media.receipt.publicUrl,
          mediaFinalizationId: media.receipt.finalizationId,
          ...(media.receipt.mediaAssetId ? { mediaAssetId: media.receipt.mediaAssetId } : {}),
          mediaType: media.receipt.mediaType,
        }
      : {};

    const fields: creator.UpdateLookBody = {
      title: title.trim(),
      caption: caption.trim(),
      visibility,
      status,
      tags,
      ...mediaFields,
    };

    try {
      if (draft) {
        await creator.updateLook(draft.id, fields);
        if (status === 'published') {
          router.push(`/look/${encodeURIComponent(draft.id)}`);
          return;
        }
      } else {
        const id = `lk_${crypto.randomUUID()}`;
        await creator.createLook({ id, mediaUrl: media!.receipt!.publicUrl, ...fields });
        if (status === 'published') {
          router.push(`/look/${encodeURIComponent(id)}`);
          return;
        }
      }
      toast.show('Draft saved', 'success');
      onDraftSaved();
      onBack();
    } catch (error: unknown) {
      setErrors({ submit: parseApiError(error, 'Couldn’t save the look').message });
    } finally {
      setPending(null);
    }
  };

  const tagOverlay = useMemo(
    () =>
      tags.length === 0 ? null : (
        <div className="pointer-events-none absolute inset-0">
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => removeTag(t.id)}
              aria-label={`Remove tag ${t.label ?? 'listing'}`}
              title={t.label}
              className="pressable pointer-events-auto absolute max-w-[55%] -translate-x-1/2 -translate-y-1/2 truncate rounded-full bg-media-overlay-scrim px-2.5 py-1 text-micro font-medium text-scrim-text-primary"
              style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
            >
              {t.label ?? 'Listing'}
            </button>
          ))}
        </div>
      ),
    [tags],
  );

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-24 pt-6 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to create"
          className="pressable -ml-2 flex h-11 w-11 items-center justify-center text-text-primary"
        >
          <Icon name="back" size={22} />
        </button>
        <h1 className="text-section-title font-semibold text-text-primary">
          {draft ? 'Edit look' : 'New look'}
        </h1>
        <span className="w-9" aria-hidden />
      </header>

      <form
        className="mt-6 space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          void submit('published');
        }}
      >
        <SellField
          id="look-media"
          label="Cover"
          required
          done={Boolean(media && !media.error)}
          error={errors.media}
          hint="A photo or short video — it uploads securely and verifies before publish."
        >
          <MediaField
            id="look-media-input"
            media={media}
            disabled={busy}
            onPick={pick}
            onClear={clear}
            overlay={tagOverlay}
          />
        </SellField>

        <SellField
          id="look-title"
          label="Title"
          done={title.trim().length > 0}
          error={errors.title}
          hint="What are you wearing?"
        >
          <input
            id="look-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Autumn layers"
            disabled={busy}
            className={`${INPUT_CLASS} ${errors.title ? INPUT_ERROR_CLASS : ''}`}
          />
        </SellField>

        <SellField id="look-caption" label="Caption" optional done={caption.trim().length > 0}>
          <textarea
            id="look-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={2200}
            rows={3}
            placeholder="Tell the story behind the fit…"
            disabled={busy}
            className="w-full rounded-md border border-border bg-input px-3.5 py-3 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none"
          />
        </SellField>

        <SellField
          id="look-tags"
          label="Tag pieces"
          optional
          done={tags.length > 0}
          hint={tags.length > 0 ? `${tags.length} tagged — tap a pin on the cover to remove it` : 'Link the listings you’re wearing so buyers can shop them'}
        >
          <button
            type="button"
            onClick={() => setTagSheetOpen(true)}
            disabled={busy}
            className={`${INPUT_CLASS} flex items-center justify-between text-left`}
          >
            <span className={tags.length ? 'text-input-text' : 'text-text-muted'}>
              {tags.length ? `${tags.length} piece${tags.length === 1 ? '' : 's'} tagged` : 'Pick from your listings'}
            </span>
            <Icon name="pricetag" size={16} className="text-text-muted" />
          </button>
        </SellField>

        <SellField id="look-visibility" label="Audience">
          <select
            id="look-visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as LookVisibility)}
            disabled={busy}
            className={INPUT_CLASS}
          >
            <option value="public">Public</option>
            <option value="followers">Followers</option>
            <option value="private">Only me</option>
          </select>
        </SellField>

        {errors.submit ? (
          <p role="alert" className="flex items-start gap-1.5 text-caption text-danger-text">
            <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
            {errors.submit}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-2">
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={busy}>
            {pending === 'publish' ? 'Publishing…' : 'Publish look'}
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="md"
            fullWidth
            disabled={busy}
            onClick={() => void submit('draft')}
          >
            {pending === 'draft' ? 'Saving…' : draft ? 'Save changes' : 'Save draft'}
          </Button>
        </div>
      </form>

      <TagSheet
        open={tagSheetOpen}
        onClose={() => setTagSheetOpen(false)}
        selectedIds={tags.map((t) => t.listingId).filter((v): v is string => Boolean(v))}
        onToggle={toggleTag}
      />
    </div>
  );
}
