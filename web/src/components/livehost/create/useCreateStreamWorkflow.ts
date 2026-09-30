'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as liveService from '@/lib/api/services/live';
import { parseApiError } from '@/lib/api/http';
import { useMyListings } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { getListingCoverUri } from '@/lib/utils/media';
import { createHostStream, syncSessionToHub, MAX_PINS } from '../hostStreams';

export interface CoverPick {
  /** listing id or 'upload' */
  key: string;
  uri: string;
  aspectRatio: number;
}

export interface FormErrors {
  title?: string;
  pins?: string;
  cover?: string;
  schedule?: string;
}

export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatConfirmed(iso: string): string {
  const at = new Date(iso);
  const day = at.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} at ${time}`;
}

export function useCreateStreamWorkflow() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isGuest } = useSession();
  const hydrated = useHydrated();
  const { data: listings, isLoading } = useMyListings();
  const isLive = DATA_MODE === 'live';

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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ iso: string; streamId: string } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(new Set<string>());

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
    if (!isLive && !cover) e.cover = 'Pick a cover for your show';
    if (schedule === 'later' || isLive) {
      if (!startAt) e.schedule = 'Pick a date and time';
      else if (Date.parse(startAt) <= Date.now()) e.schedule = 'Start time must be in the future';
    }
    return e;
  };

  const submitLive = async (scheduledIso: string) => {
    const session = await liveService.createBroadcastSession({
      title: title.trim(),
      scheduledStartAt: scheduledIso,
    });
    for (const [i, listingId] of pinIds.entries()) {
      const listing = available.find((l) => l.id === listingId);
      await liveService.scheduleStreamLot(session.id, {
        listingId,
        lotNumber: i + 1,
        position: i,
        startPriceGbp: listing?.price ?? 0,
      });
    }
    qc.invalidateQueries({ queryKey: ['live-sessions'] });
    setConfirmed({ iso: scheduledIso, streamId: session.id });
    window.scrollTo({ top: 0 });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    setSubmitError(null);
    if (Object.values(next).some(Boolean)) return;
    if (!isLive && !cover) return;
    if (uploadedUri) committedRef.current.add(uploadedUri);

    setPending(true);
    if (isLive) {
      const scheduledIso = new Date(startAt).toISOString();
      submitLive(scheduledIso)
        .catch((error: unknown) => {
          setSubmitError(parseApiError(error, 'The show could not be scheduled').message);
        })
        .finally(() => setPending(false));
      return;
    }
    window.setTimeout(() => {
      const scheduledIso =
        schedule === 'later' ? new Date(startAt).toISOString() : undefined;
      const stream = createHostStream({
        title: title.trim(),
        coverUri: cover!.uri,
        coverAspectRatio: cover!.aspectRatio,
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

  const scheduling = isLive || schedule === 'later';

  return {
    router,
    isGuest,
    hydrated,
    isLoading,
    isLive,
    available,
    title,
    setTitle,
    pinIds,
    togglePin,
    coverKey,
    setCoverKey,
    coverOptions,
    cover,
    fileRef,
    onUpload,
    schedule,
    setSchedule,
    scheduling,
    startAt,
    setStartAt,
    minStart,
    errors,
    setErrors,
    pending,
    submitError,
    confirmed,
    submit,
  };
}
