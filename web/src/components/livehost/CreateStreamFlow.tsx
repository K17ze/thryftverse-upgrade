'use client';

/**
 * CreateStreamFlow — compose a show: cover pick (a listing cover or an
 * upload), title, ordered pins over your active listings (max 6), and a
 * start time (now or a scheduled slot). Fixture mode: nothing is broadcast
 * — the show is simulated locally and dissolves on reload, and the page
 * says so next to the action that creates it.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useMyListings } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import {
  createHostStream,
  syncSessionToHub,
  MAX_PINS,
} from './hostStreams';
import { HostGate } from './HostGate';

interface CoverPick {
  /** listing id or 'upload' */
  key: string;
  uri: string;
  aspectRatio: number;
}

interface FormErrors {
  title?: string;
  pins?: string;
  cover?: string;
  schedule?: string;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatConfirmed(iso: string): string {
  const at = new Date(iso);
  const day = at.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} at ${time}`;
}

const FIELD_LABEL = 'text-label font-semibold uppercase tracking-wide text-text-secondary';
const INPUT =
  'h-12 w-full rounded-lg border border-border bg-input px-4 text-body text-input-text outline-none placeholder:text-text-muted focus:border-text-muted';

export function CreateStreamFlow() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isGuest } = useSession();
  const hydrated = useHydrated();
  const { data: listings, isLoading } = useMyListings();

  const available = (listings ?? []).filter((l) => !l.isSold && l.status !== 'sold');

  const [title, setTitle] = useState('');
  const [pinIds, setPinIds] = useState<string[]>([]);
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [uploadedUri, setUploadedUri] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<'now' | 'later'>('now');
  const [startAt, setStartAt] = useState('');
  const [minStart, setMinStart] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState<{ iso: string; streamId: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  // Object URLs are preview-only — revoked on replace/unmount unless the
  // created stream committed them (the hub tile still renders them).
  const committedRef = useRef(new Set<string>());

  // Earliest schedulable slot — computed post-mount so SSR and the first
  // client render agree (datetime-local min is clock-derived).
  useEffect(() => {
    setMinStart(toLocalInputValue(new Date(Date.now() + 5 * 60_000)));
  }, []);

  const uploadRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (uploadRef.current && !committedRef.current.has(uploadRef.current)) {
        URL.revokeObjectURL(uploadRef.current);
      }
    },
    [],
  );

  // Cover options — each active listing's cover plus the uploaded photo.
  const coverOptions: CoverPick[] = [
    ...(uploadedUri ? [{ key: 'upload', uri: uploadedUri, aspectRatio: 4 / 5 }] : []),
    ...available
      .map((l) => ({
        key: l.id,
        uri: getListingCoverUri(l.images),
        aspectRatio: l.mediaAspectRatio && l.mediaAspectRatio > 0 ? l.mediaAspectRatio : 4 / 5,
      }))
      .filter((c) => c.uri.length > 0),
  ];
  const cover =
    coverOptions.find((c) => c.key === coverKey) ?? coverOptions[0] ?? null;

  const togglePin = (id: string) => {
    setPinIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= MAX_PINS) return ids;
      return [...ids, id];
    });
    setErrors((e) => (e.pins ? { ...e, pins: undefined } : e));
  };

  const onUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const uri = URL.createObjectURL(file);
    if (uploadRef.current && !committedRef.current.has(uploadRef.current)) {
      URL.revokeObjectURL(uploadRef.current);
    }
    uploadRef.current = uri;
    setUploadedUri(uri);
    setCoverKey('upload');
    setErrors((e) => (e.cover ? { ...e, cover: undefined } : e));
  };

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (title.trim().length < 3) e.title = 'Give your show a title (3+ characters)';
    if (pinIds.length === 0) e.pins = 'Pin at least one item to sell';
    if (!cover) e.cover = 'Pick a cover for your show';
    if (schedule === 'later') {
      if (!startAt) e.schedule = 'Pick a date and time';
      else if (Date.parse(startAt) <= Date.now()) e.schedule = 'Start time must be in the future';
    }
    return e;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean) || !cover) return;
    if (uploadedUri) committedRef.current.add(uploadedUri);

    setPending(true);
    window.setTimeout(() => {
      const scheduledIso =
        schedule === 'later' ? new Date(startAt).toISOString() : undefined;
      const stream = createHostStream({
        title: title.trim(),
        coverUri: cover.uri,
        coverAspectRatio: cover.aspectRatio,
        pinIds,
        scheduledAt: scheduledIso,
      });
      syncSessionToHub(qc, stream.session);
      setPending(false);
      if (scheduledIso) {
        setConfirmed({ iso: scheduledIso, streamId: stream.session.id });
        window.scrollTo({ top: 0 });
      } else {
        router.push(`/live/host/${stream.session.id}`);
      }
    }, 550);
  };

  if (isGuest) return <HostGate />;
  if (!hydrated || isLoading) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 pt-6 sm:px-6" aria-busy aria-label="Loading go live">
        <div className="skeleton h-7 w-40 rounded-md" />
        <div className="skeleton mt-6 aspect-[16/10] w-full rounded-lg" />
        <div className="skeleton mt-6 h-12 w-full rounded-lg" />
        <div className="skeleton mt-6 h-24 w-full rounded-lg" />
      </div>
    );
  }

  if (available.length === 0) {
    return (
      <EmptyState
        icon="inventory"
        title="Nothing to sell live"
        subtitle="List an item first — live shows are built from your active listings."
        actionLabel="List an item"
        onAction={() => router.push('/sell')}
      />
    );
  }

  if (confirmed) {
    return (
      <div className="mx-auto flex w-full max-w-[440px] flex-col items-center px-4 py-24 text-center sm:px-6">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-success-text">
          <Icon name="check" filled size={28} />
        </span>
        <h1 className="mt-5 text-screen-title font-bold text-text-primary">Show scheduled</h1>
        <p className="mt-2 text-body text-text-secondary">
          {formatConfirmed(confirmed.iso)} — your show appears under Coming up.
        </p>
        <div className="mt-7 flex w-full flex-col gap-2">
          <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/live')}>
            Done
          </Button>
          <Button
            variant="quiet"
            size="md"
            fullWidth
            onClick={() => router.push(`/live/host/${confirmed.streamId}`)}
          >
            Manage show
          </Button>
        </div>
      </div>
    );
  }

  const scheduling = schedule === 'later';

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-6 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-screen-title font-bold text-text-primary">Go live</h1>
          <p className="mt-1 text-body text-text-secondary">
            Pick a cover, pin what you&apos;re selling, choose when.
          </p>
        </div>
        <Link
          href="/live"
          className="pressable mt-1.5 shrink-0 rounded-md px-2 py-1.5 text-caption font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          Cancel
        </Link>
      </header>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-7" noValidate>
        {/* Cover — the object buyers see on the live hub */}
        <fieldset>
          <legend className={FIELD_LABEL}>Cover</legend>
          <div className="relative mt-3 aspect-[16/10] w-full overflow-hidden rounded-lg bg-surface-alt">
            {cover ? (
              <AppImage
                src={cover.uri}
                alt="Show cover preview"
                fill
                className="h-full w-full"
                sizes="720px"
              />
            ) : null}
          </div>
          <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="pressable flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-text-muted transition-colors hover:border-text-muted hover:text-text-secondary"
              aria-label="Upload a cover photo"
            >
              <Icon name="camera" size={20} />
              <span className="text-micro font-medium">Upload</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onUpload(e.target.files);
                e.target.value = '';
              }}
            />
            <div role="radiogroup" aria-label="Choose a cover" className="flex gap-2.5">
              {coverOptions.map((option) => {
              const selected = cover?.key === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={option.key === 'upload' ? 'Uploaded cover' : 'Listing cover'}
                  onClick={() => setCoverKey(option.key)}
                  className={`pressable relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md border ${
                    selected ? 'border-text-primary' : 'border-border'
                  }`}
                >
                  <AppImage src={option.uri} alt="" fill sizes="72px" className="h-full w-full" />
                  {selected ? (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-scrim-text-primary text-black">
                      <Icon name="check" size={11} />
                    </span>
                  ) : null}
                </button>
              );
            })}
            </div>
          </div>
          {errors.cover ? (
            <p role="alert" className="mt-1.5 text-caption text-danger-text">{errors.cover}</p>
          ) : null}
        </fieldset>

        {/* Title */}
        <div className="flex flex-col gap-2">
          <label htmlFor="live-title" className={FIELD_LABEL}>
            Stream title
          </label>
          <input
            id="live-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setErrors((er) => (er.title ? { ...er, title: undefined } : er));
            }}
            maxLength={60}
            placeholder="e.g. Weekend closet clear-out"
            className={INPUT}
          />
          {errors.title ? (
            <p role="alert" className="text-caption text-danger-text">{errors.title}</p>
          ) : null}
        </div>

        {/* Pinned products — ordered, max MAX_PINS */}
        <fieldset className="border-t border-border-subtle pt-6">
          <legend className={FIELD_LABEL}>
            Pinned products{pinIds.length > 0 ? ` · ${pinIds.length} of ${MAX_PINS}` : ''}
          </legend>
          <div className="mt-3" role="group" aria-label="Your active listings">
            {available.map((listing) => {
              const order = pinIds.indexOf(listing.id);
              const selected = order >= 0;
              const atCap = !selected && pinIds.length >= MAX_PINS;
              return (
                <button
                  key={listing.id}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  disabled={atCap}
                  onClick={() => togglePin(listing.id)}
                  className="pressable flex w-full items-center gap-3 border-b border-border-subtle py-2.5 text-left last:border-b-0 disabled:opacity-40"
                >
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                    <AppImage
                      src={getListingCoverUri(listing.images)}
                      alt={listing.title}
                      fill
                      sizes="48px"
                      className="h-full w-full"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="clamp-1 block text-body font-medium text-text-primary">
                      {listing.title}
                    </span>
                    <span className="tnum mt-0.5 block text-meta text-text-muted">
                      {formatPrice(listing.price)}
                    </span>
                  </span>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      selected ? 'border-brand' : 'border-border'
                    }`}
                  >
                    {selected ? (
                      <span className="tnum text-caption font-semibold text-text-primary">
                        {order + 1}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          {errors.pins ? (
            <p role="alert" className="mt-1.5 text-caption text-danger-text">{errors.pins}</p>
          ) : (
            <p className="mt-1.5 text-meta text-text-muted">
              Order is the running order — the first pin is on the table when you open.
            </p>
          )}
        </fieldset>

        {/* Start time */}
        <fieldset className="border-t border-border-subtle pt-6">
          <legend className={FIELD_LABEL}>Start time</legend>
          <div className="mt-3" role="radiogroup" aria-label="When to start">
            {(
              [
                { key: 'now' as const, label: 'Now', meta: 'Go live immediately' },
                { key: 'later' as const, label: 'Later', meta: 'Schedule the show' },
              ]
            ).map((option) => {
              const selected = schedule === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSchedule(option.key)}
                  className="pressable flex w-full items-center justify-between border-b border-border-subtle py-3 text-left last:border-b-0"
                >
                  <span>
                    <span className="block text-body font-medium text-text-primary">{option.label}</span>
                    <span className="mt-0.5 block text-meta text-text-muted">{option.meta}</span>
                  </span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                      selected ? 'border-brand' : 'border-border'
                    }`}
                  >
                    {selected ? <Icon name="check" size={13} className="text-text-primary" /> : null}
                  </span>
                </button>
              );
            })}
            {scheduling ? (
              <div className="mt-3">
                <input
                  type="datetime-local"
                  value={startAt}
                  min={minStart}
                  onChange={(e) => {
                    setStartAt(e.target.value);
                    setErrors((er) => (er.schedule ? { ...er, schedule: undefined } : er));
                  }}
                  aria-label="Scheduled start"
                  className={INPUT}
                />
                <p className="mt-1.5 text-meta text-text-muted">
                  Scheduled shows appear in Coming up — followers get notified when you go live.
                </p>
              </div>
            ) : null}
            {errors.schedule ? (
              <p role="alert" className="mt-1.5 text-caption text-danger-text">{errors.schedule}</p>
            ) : null}
          </div>
        </fieldset>

        {/* Action + honesty note */}
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-6">
          <Button
            type="submit"
            size="lg"
            fullWidth
            variant={scheduling ? 'primary' : 'danger'}
            disabled={pending}
          >
            {pending ? (scheduling ? 'Scheduling…' : 'Going live…') : scheduling ? 'Schedule show' : 'Go live'}
          </Button>
          <p className="text-meta text-text-muted">
            Demo mode — this stream is simulated: viewers, chat and orders are generated locally,
            no video is broadcast, and the show clears on reload.
          </p>
        </div>
      </form>
    </div>
  );
}
