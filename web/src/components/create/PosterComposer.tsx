'use client';

/**
 * PosterComposer — web authoring for a poster story: one media frame +
 * caption, published via POST /poster-stories (the entity /poster/[id]
 * resolves through GET /poster-stories/:id).
 *
 * Drafts are real `posters` rows with status:'draft' (POST /posters
 * upserts by id). The draft row doesn't carry the upload receipt the
 * story route verifies, so the receipt is cached locally
 * (lib/creator/draftReceipts) at save time; when it's missing the composer
 * asks to re-add the media rather than publishing a rejected frame.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PosterDraft, StagedMediaReceipt } from '@/lib/api/services/creator';
import * as creator from '@/lib/api/services/creator';
import { dropDraftReceipt, readDraftReceipt, saveDraftReceipt } from '@/lib/creator/draftReceipts';
import { parseApiError } from '@/lib/api/http';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { SellField, INPUT_CLASS } from '@/components/sell/SellField';
import { MediaField, useStagedMedia } from './MediaField';

interface PosterComposerProps {
  /** Resumed server draft row — re-saves upsert the same id; publishing
   *  mints the story under it and deletes the draft row. */
  draft?: PosterDraft;
  /** Captured-at-entry media (camera sheet) — stages through the same
   *  pick() path as a file pick on mount, becoming the story's frame. */
  initialFile?: File;
  onDraftSaved: () => void;
  onBack: () => void;
}

type Pending = 'publish' | 'draft' | null;

interface PosterErrors {
  media?: string;
  submit?: string;
}

export function PosterComposer({ draft, initialFile, onDraftSaved, onBack }: PosterComposerProps) {
  const router = useRouter();
  const toast = useToast();
  const { media, seed, pick, clear } = useStagedMedia('poster');

  const [caption, setCaption] = useState(draft?.caption ?? '');
  const [audience, setAudience] = useState<'public' | 'private'>('public');
  const [errors, setErrors] = useState<PosterErrors>({});
  const [pending, setPending] = useState<Pending>(null);
  const seededRef = useRef(false);
  const idRef = useRef(draft?.id ?? `ps_${crypto.randomUUID()}`);

  useEffect(() => {
    if (seededRef.current) return;
    if (draft) {
      seededRef.current = true;
      seed(draft.mediaUrl, draft.mediaType, readDraftReceipt(draft.id));
    } else if (initialFile) {
      seededRef.current = true;
      pick(initialFile);
    }
  }, [draft, initialFile, seed, pick]);

  const busy = pending !== null || media?.uploading === true;

  const validate = (intent: 'published' | 'draft'): PosterErrors => {
    const e: PosterErrors = {};
    if (!media) {
      e.media = draft ? 'Keep the draft media or add a new one' : 'Add a photo or video';
    } else if (intent === 'published' && !media.receipt) {
      e.media = media.uploading
        ? 'Wait for the upload to finish'
        : 'Re-add the media — publishing needs a verified upload';
    } else if (!media.receipt && (!draft || media.previewUrl !== draft.mediaUrl)) {
      // Re-staged media without a receipt must never write its blob:
      // preview into the draft row — the durable mediaUrl survives.
      e.media = media.uploading ? 'Wait for the upload to finish' : 'Re-add the media — the upload didn’t finish';
    }
    return e;
  };

  const submit = async (status: 'published' | 'draft') => {
    const next = validate(status);
    setErrors(next);
    if (next.media) return;
    setPending(status === 'published' ? 'publish' : 'draft');

    const receipt: StagedMediaReceipt | null = media?.receipt ?? null;
    const id = idRef.current;

    try {
      if (status === 'draft') {
        await creator.upsertPoster({
          id,
          mediaUrl: receipt?.publicUrl ?? draft?.mediaUrl ?? media!.previewUrl,
          ...(receipt ? { mediaFinalizationId: receipt.finalizationId } : {}),
          caption: caption.trim(),
          status: 'draft',
        });
        if (receipt) saveDraftReceipt(id, receipt);
        toast.show('Draft saved', 'success');
        onDraftSaved();
        onBack();
        return;
      }

      // Publish — one image/video frame, verified by finalization receipt.
      await creator.createPosterStory({
        id,
        audience,
        frames: [
          {
            id: `${id}_f1`,
            mediaType: receipt!.mediaType,
            mediaUrl: receipt!.publicUrl,
            mediaFinalizationId: receipt!.finalizationId,
            ...(receipt!.mediaAssetId ? { mediaAssetId: receipt!.mediaAssetId } : {}),
            caption: caption.trim(),
            sortOrder: 0,
          },
        ],
      });

      if (draft) {
        // The story now owns the id — drop the superseded draft row and the
        // local receipt. Delete failure leaves a harmless draft behind.
        try {
          await creator.deletePoster(draft.id);
        } catch {
          /* draft row lingers, still discardable from the list */
        }
        dropDraftReceipt(draft.id);
      }

      router.push(`/poster/${encodeURIComponent(id)}`);
    } catch (error: unknown) {
      setErrors({
        submit: parseApiError(error, status === 'draft' ? 'Couldn’t save the draft' : 'Couldn’t publish the poster').message,
      });
    } finally {
      setPending(null);
    }
  };

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
          {draft ? 'Edit poster' : 'New poster'}
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
          id="poster-media"
          label="Media"
          required
          done={Boolean(media && !media.error)}
          error={errors.media}
          hint="One photo or clip — it becomes the first frame of your story."
        >
          <MediaField
            id="poster-media-input"
            media={media}
            disabled={busy}
            onPick={pick}
            onClear={clear}
          />
        </SellField>

        <SellField
          id="poster-caption"
          label="Caption"
          optional
          done={caption.trim().length > 0}
          hint="Shown over the frame — posters stay live for 24 hours."
        >
          <textarea
            id="poster-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={2200}
            rows={3}
            placeholder="New drop, fit check, behind the scenes…"
            disabled={busy}
            className="w-full rounded-md border border-border bg-input px-3.5 py-3 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none"
          />
        </SellField>

        <SellField id="poster-audience" label="Audience">
          <select
            id="poster-audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value as 'public' | 'private')}
            disabled={busy}
            className={INPUT_CLASS}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
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
            {pending === 'publish' ? 'Publishing…' : 'Publish poster'}
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
    </div>
  );
}
