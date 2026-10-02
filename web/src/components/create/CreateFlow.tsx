'use client';

/**
 * CreateFlow — web counterpart of the native CreatorStudio entry
 * (frontend/src/creator/studio/CreatorEntryScreen.tsx). Mode picker
 * (Look | Poster), server-backed draft tray with resume/discard, guest
 * sign-in gate. Publish success navigates to /look/[id] or /poster/[id].
 *
 * Drafts are real entities with status:'draft' — looks via
 * GET /looks?status=draft (caller-scoped), posters via
 * GET /posters?creatorId=&status=draft; discard is DELETE on each route.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import * as creator from '@/lib/api/services/creator';
import type { CreatorDraft } from '@/lib/api/services/creator';
import { dropDraftReceipt } from '@/lib/creator/draftReceipts';
import { parseApiError } from '@/lib/api/http';
import { timeAgo } from '@/lib/utils/format';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { isCameraCaptureSupported } from '@/lib/media/cameraSupport';
import { CreateCameraSheet } from './CreateCameraSheet';
import { LookComposer } from './LookComposer';
import { PosterComposer } from './PosterComposer';

type Mode = 'entry' | 'look' | 'poster';

const CHOICES: { mode: 'look' | 'poster'; icon: AppIconName; title: string; sub: string }[] = [
  {
    mode: 'look',
    icon: 'layers',
    title: 'Look',
    sub: 'A photo or video with your pieces tagged',
  },
  {
    mode: 'poster',
    icon: 'image',
    title: 'Poster',
    sub: 'A story that’s live for 24 hours',
  },
];

export function CreateFlow() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user, isGuest, sessionLoading } = useSession();

  const [mode, setMode] = useState<Mode>('entry');
  const [resume, setResume] = useState<CreatorDraft | null>(null);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  /** Which composer the open camera sheet is capturing for — capture
   *  commits straight into that composer (mobile camera-first entry). */
  const [cameraFor, setCameraFor] = useState<'look' | 'poster' | null>(null);
  /** Captured file carried into the next composer mount. */
  const [initialFile, setInitialFile] = useState<File | null>(null);
  /** getUserMedia is a secure-context, post-mount capability — detected in
   *  an effect so SSR and unsupported browsers never render a dead
   *  affordance; the honest fallback is the upload entry alone. */
  const [cameraSupported, setCameraSupported] = useState(false);

  useEffect(() => {
    setCameraSupported(isCameraCaptureSupported());
  }, []);

  const draftsQuery = useQuery({
    queryKey: ['creator-drafts', user?.id],
    queryFn: ({ signal }) => creator.fetchCreatorDrafts(user!.id, signal),
    // Draft rows are live-backend entities — fixture mode has no
    // look/poster draft source, so the honest tray is an empty list, not
    // a dead request to :4000.
    enabled: DATA_MODE === 'live' && Boolean(user && !isGuest),
    staleTime: 15_000,
  });

  const refreshDrafts = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['creator-drafts'] });
  }, [qc]);

  const discard = async (draft: CreatorDraft) => {
    setDiscardingId(draft.id);
    setDraftsError(null);
    try {
      if (draft.kind === 'look') await creator.deleteLook(draft.id);
      else await creator.deletePoster(draft.id);
      dropDraftReceipt(draft.id);
      setConfirmDiscardId(null);
      toast.show('Draft discarded', 'info');
      refreshDrafts();
    } catch (error: unknown) {
      setDraftsError(parseApiError(error, 'Couldn’t discard the draft').message);
    } finally {
      setDiscardingId(null);
    }
  };

  const backToEntry = useCallback(() => {
    setMode('entry');
    setResume(null);
    setInitialFile(null);
  }, []);

  // ── Session resolving — skeleton mirrors the entry geometry ────────
  if (sessionLoading) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 pb-24 pt-6 sm:px-6" aria-busy aria-label="Loading create">
        <div className="skeleton h-8 w-32 rounded-md" />
        <div className="mt-8 space-y-px">
          <div className="skeleton h-20 w-full rounded-md" />
          <div className="skeleton h-20 w-full rounded-md" />
        </div>
      </div>
    );
  }

  // ── Guest gate — creation is account-bound; route to sign-in ───────
  if (isGuest || !user) {
    return (
      <div className="mx-auto flex w-full max-w-[440px] flex-col items-center px-4 py-24 text-center sm:px-6">
        <Icon name="create" size={36} className="text-text-muted" />
        <h1 className="mt-5 text-screen-title text-text-primary">Create on ThryftVerse</h1>
        <p className="mt-2 text-body text-text-secondary">
          Sign in to publish looks and posters — drafts save to your account.
        </p>
        <div className="mt-7 flex w-full flex-col gap-2">
          <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/auth')}>
            Sign in
          </Button>
          <Button variant="quiet" size="md" fullWidth onClick={() => router.push('/')}>
            Keep browsing
          </Button>
        </div>
      </div>
    );
  }

  // ── Composers ──────────────────────────────────────────────────────
  if (mode === 'look') {
    return (
      <LookComposer
        draft={resume?.kind === 'look' ? resume : undefined}
        initialFile={resume ? undefined : (initialFile ?? undefined)}
        onDraftSaved={refreshDrafts}
        onBack={backToEntry}
      />
    );
  }
  if (mode === 'poster') {
    return (
      <PosterComposer
        draft={resume?.kind === 'poster' ? resume : undefined}
        initialFile={resume ? undefined : (initialFile ?? undefined)}
        onDraftSaved={refreshDrafts}
        onBack={backToEntry}
      />
    );
  }

  // ── Entry: mode picker + drafts ────────────────────────────────────
  const drafts = draftsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-24 pt-6 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-screen-title text-text-primary">Create</h1>
        </div>
        <Link
          href="/"
          className="pressable mt-1.5 shrink-0 rounded-md px-2 py-1.5 text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          Cancel
        </Link>
      </header>

      <div className="mt-6 border-t border-border-subtle">
        {CHOICES.map((choice) => (
          <div key={choice.mode} className="border-b border-border-subtle">
            <button
              type="button"
              onClick={() => {
                setResume(null);
                setInitialFile(null);
                setMode(choice.mode);
              }}
              className="pressable flex w-full items-center gap-4 py-5 text-left"
            >
              <Icon name={choice.icon} size={22} className="shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1">
                <span className="block text-body-emphasis font-semibold text-text-primary">{choice.title}</span>
                <span className="mt-0.5 block text-caption text-text-secondary">{choice.sub}</span>
              </span>
              <Icon name="forward" size={18} className="shrink-0 text-text-muted" />
            </button>
            {/* Camera-first entry — the mobile root state, offered per
                composer path so a capture lands in the right composer.
                Rendered only where getUserMedia is real. */}
            {cameraSupported ? (
              <div className="-mt-2 pb-4 pl-16">
                <button
                  type="button"
                  aria-label={`Take a photo for a new ${choice.mode}`}
                  onClick={() => setCameraFor(choice.mode)}
                  className="pressable flex h-11 items-center gap-2 rounded-md text-body font-medium text-text-secondary transition-colors hover:text-text-primary"
                >
                  <Icon name="camera" size={16} />
                  Take a photo
                </button>
              </div>
            ) : null}
          </div>
        ))}
        <Link
          href="/sell"
          className="pressable flex w-full items-center gap-4 border-b border-border-subtle py-5 text-left"
        >
          <Icon name="pricetag" size={22} className="shrink-0 text-text-secondary" />
          <span className="min-w-0 flex-1">
            <span className="block text-body-emphasis font-semibold text-text-primary">Sell an item</span>
            <span className="mt-0.5 block text-caption text-text-secondary">List something from your closet</span>
          </span>
          <Icon name="forward" size={18} className="shrink-0 text-text-muted" />
        </Link>
      </div>

      {/* Drafts — real server rows (status:'draft'), resume or discard. */}
      <section aria-labelledby="create-drafts-heading" className="mt-10">
        <h2 id="create-drafts-heading" className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Drafts
        </h2>

        {draftsQuery.isLoading ? (
          <div className="mt-3 space-y-3" aria-busy aria-label="Loading drafts">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-14 w-11 rounded-md" />
                <div className="flex-1">
                  <div className="skeleton h-3.5 w-24 rounded" />
                  <div className="skeleton mt-1.5 h-3 w-40 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : draftsQuery.isError ? (
          <div className="mt-3 flex items-center gap-2 text-caption text-danger-text" role="alert">
            <Icon name="warning" size={14} />
            <span>Couldn’t load drafts.</span>
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => void draftsQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : drafts.length === 0 ? (
          <p className="mt-3 text-caption text-text-muted">Nothing in progress — drafts you save appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle">
            {drafts.map((draft) => (
              <li key={`${draft.kind}:${draft.id}`} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setResume(draft);
                    setInitialFile(null);
                    setMode(draft.kind);
                  }}
                  className="pressable flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-label={`Resume ${draft.kind} draft`}
                >
                  {draft.mediaType === 'video' ? (
                    <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-muted">
                      <Icon name="play" size={18} />
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- remote draft media, any upload host
                    <img
                      src={draft.mediaUrl}
                      alt=""
                      className="h-14 w-11 shrink-0 rounded-md bg-surface-alt object-cover"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
                      {draft.kind === 'look' ? draft.title || 'Untitled look' : draft.caption || 'Poster draft'}
                    </span>
                    <span className="mt-0.5 block text-caption text-text-muted">
                      {draft.kind === 'look' ? 'Look' : 'Poster'}
                      {draft.createdAt ? ` · ${timeAgo(draft.createdAt)}` : ''}
                    </span>
                  </span>
                </button>

                {confirmDiscardId === draft.id ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={discardingId === draft.id}
                      onClick={() => void discard(draft)}
                    >
                      {discardingId === draft.id ? 'Discarding…' : 'Discard'}
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={discardingId === draft.id}
                      onClick={() => setConfirmDiscardId(null)}
                    >
                      Keep
                    </Button>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={`Discard ${draft.kind} draft`}
                    onClick={() => setConfirmDiscardId(draft.id)}
                    className="pressable flex h-11 w-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:text-danger-text"
                  >
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {draftsError ? (
          <p role="alert" className="mt-2 flex items-center gap-1.5 text-caption text-danger-text">
            <Icon name="warning" size={14} />
            {draftsError}
          </p>
        ) : null}
      </section>

      {/* Camera capture — one slot (a look/poster takes a single frame).
          Commit carries the file into that composer's staged-media path. */}
      {cameraSupported ? (
        <CreateCameraSheet
          open={cameraFor !== null}
          onClose={() => setCameraFor(null)}
          onCapture={(files) => {
            const file = files[0];
            const target = cameraFor;
            setCameraFor(null);
            if (file && target) {
              setResume(null);
              setInitialFile(file);
              setMode(target);
            }
          }}
          remainingSlots={1}
        />
      ) : null}
    </div>
  );
}
