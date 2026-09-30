'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  appendFixtureMessage,
  POSTERS,
  STORY_RAIL,
  USERS,
  userById,
} from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import * as chatService from '@/lib/api/services/chat';
import { useCreateConversation } from '@/lib/hooks/queries';
import { useSignupWall } from '@/components/auth/SignupWall';
import { POSTER_SLIDES } from '@/lib/data/fixtures-media';
import {
  archiveStoryById,
  posterTagsFor,
  type PosterArchiveStory,
} from '@/lib/data/fixtures-posters';
import { usePosterArchive } from '@/lib/store/posterArchive';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { useShare } from '@/components/profile/useShare';
import type { ConfirmSheetState } from '@/components/orders/ConfirmSheet';

export const FRAME_MS = 6000;
export const HOLD_MS = 180;
const tick = (ms = 240) => new Promise((r) => setTimeout(r, ms));

export interface PosterView {
  id: string;
  authorId: string;
  slides: string[];
  frameCaptions: (string | undefined)[];
  caption?: string | null;
  createdAt?: string;
  story?: PosterArchiveStory;
  creator?: { id: string; username: string | null; avatar: string | null } | null;
  allowReplies?: boolean;
}

export function usePoster(id: string) {
  return useQuery<PosterView | null>({
    queryKey: ['poster', id, DATA_MODE],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const story = await socialService.fetchPosterStory(id);
        if (!story) return null;
        const frames = story.frames;
        return {
          id: story.id,
          authorId: story.creatorId,
          slides: frames.map((f) => f.posterUrl || f.mediaUrl),
          frameCaptions: frames.map((f) => f.caption ?? undefined),
          caption: frames[0]?.caption ?? null,
          createdAt: story.createdAt,
          creator: story.creator,
          allowReplies: story.allowReplies,
          story: socialService.mapPosterStoryToArchive(story),
        };
      }
      await tick();
      const poster = POSTERS.find((p) => p.id === id);
      if (poster) {
        const slides = POSTER_SLIDES[id] ?? [poster.coverUri];
        return {
          id: poster.id,
          authorId: poster.authorId,
          slides,
          frameCaptions: slides.map(() => undefined),
          caption: poster.caption,
          createdAt: poster.createdAt,
        };
      }
      const story = archiveStoryById(id);
      if (story) {
        return {
          id: story.id,
          authorId: story.creatorId,
          slides: story.frames.map((f) => f.mediaUrl),
          frameCaptions: story.frames.map((f) => f.caption),
          createdAt: story.createdAt,
          story,
        };
      }
      const rail = STORY_RAIL.find((s) => s.id === id);
      if (rail) {
        const railAuthor = USERS.find((u) => u.username === rail.username);
        return {
          id: rail.id,
          authorId: railAuthor?.id ?? 'me',
          slides: [rail.coverUri],
          frameCaptions: [undefined],
        };
      }
      return null;
    },
  });
}

export function usePosterWorkflow(id: string) {
  const router = useRouter();
  const { show } = useToast();
  const share = useShare();
  const { user: me } = useSession();
  const hydrated = useHydrated();
  const { data, isLoading } = usePoster(id);
  const queryClient = useQueryClient();
  const { requireAuth, wall } = useSignupWall();
  const createConversation = useCreateConversation();

  const [frame, setFrame] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);
  const suppressClick = useRef(false);

  const removedStoryIds = usePosterArchive((s) => s.removedStoryIds);
  const archivedStoryIds = usePosterArchive((s) => s.archivedStoryIds);
  const archiveStory = usePosterArchive((s) => s.archiveStory);
  const removeStory = usePosterArchive((s) => s.removeStory);

  const slides = data?.slides ?? [];
  const frameCount = slides.length;
  const tags = posterTagsFor(id).filter((t) => (t.frameIndex ?? 0) === frame);

  const isOwn = !!data?.story && !!me && data.authorId === me.id;
  const storyStatus: 'active' | 'archived' | undefined = data?.story
    ? hydrated && archivedStoryIds.includes(data.story.id)
      ? 'archived'
      : data.story.status
    : undefined;

  const next = useCallback(() => {
    setProgress(0);
    setFrame((f) => Math.min(f + 1, frameCount - 1));
  }, [frameCount]);

  const prev = useCallback(() => {
    setProgress(0);
    setFrame((f) => Math.max(f - 1, 0));
  }, []);

  useEffect(() => {
    if (frameCount <= 1 || frame >= frameCount - 1 || paused) return;
    const started = Date.now() - progress * FRAME_MS;
    const interval = setInterval(() => {
      const p = (Date.now() - started) / FRAME_MS;
      if (p >= 1) {
        clearInterval(interval);
        next();
      } else {
        setProgress(p);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [frame, frameCount, paused, next, progress]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') router.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, router]);

  const recordedFrames = useRef<Set<string>>(new Set());
  useEffect(() => {
    recordedFrames.current = new Set();
  }, [id]);
  useEffect(() => {
    if (DATA_MODE !== 'live' || !me || !data?.story || isOwn) return;
    const frameId = data.story.frames[frame]?.id;
    if (!frameId || recordedFrames.current.has(frameId)) return;
    recordedFrames.current.add(frameId);
    void socialService.recordPosterFrameView(frameId).catch(() => {});
  }, [frame, data, me, isOwn]);

  const onZoneDown = () => {
    heldRef.current = false;
    suppressClick.current = false;
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      setPaused(true);
    }, HOLD_MS);
  };

  const onZoneRelease = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (heldRef.current) {
      heldRef.current = false;
      suppressClick.current = true;
      setPaused(false);
    }
  };

  const onZoneClick = (advance: () => void) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    advance();
  };

  const isRemoved = hydrated && !!data?.story && removedStoryIds.includes(data.id);

  const author =
    data?.creator ??
    (DATA_MODE === 'live' ? null : data ? userById(data.authorId) : null);
  const authorUsername = author?.username ?? null;
  const authorHref = authorUsername
    ? data?.authorId === 'me'
      ? '/profile'
      : `/u/${authorUsername}`
    : null;

  const canReply =
    !!author &&
    data?.authorId !== 'me' &&
    data?.authorId !== me?.id &&
    data?.allowReplies !== false;
  const caption = data ? data.frameCaptions[frame] ?? data.caption : null;
  const expiresAt = data?.story ? new Date(data.story.expiresAt).getTime() : 0;
  const hoursLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 3600e3));

  const posterUrl = typeof window !== 'undefined' ? `${window.location.origin}/poster/${id}` : '';

  const sharePoster = () => share({ url: posterUrl, title: 'Poster on ThryftVerse' });
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(posterUrl);
      show('Link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  const askDelete = () =>
    setConfirm({
      title: 'Delete story?',
      message: 'This will permanently remove your poster story.',
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: () => {
        if (DATA_MODE === 'live') {
          void (async () => {
            try {
              await socialService.deletePosterStory(id);
              void queryClient.invalidateQueries({ queryKey: ['poster-stories'] });
              void queryClient.invalidateQueries({ queryKey: ['poster-archive'] });
              void queryClient.removeQueries({ queryKey: ['poster', id] });
              setConfirm(null);
              show('Story deleted', 'info');
              router.back();
            } catch {
              show('Could not delete the story', 'error');
            }
          })();
          return;
        }
        removeStory(id);
        setConfirm(null);
        show('Story deleted', 'info');
        router.back();
      },
    });

  const archiveNow = () => {
    setOptionsOpen(false);
    if (DATA_MODE === 'live') {
      void (async () => {
        try {
          await socialService.archivePosterStory(id);
          void queryClient.invalidateQueries({ queryKey: ['poster', id] });
          void queryClient.invalidateQueries({ queryKey: ['poster-stories'] });
          void queryClient.invalidateQueries({ queryKey: ['poster-archive'] });
          show('Story archived', 'info');
        } catch {
          show('Could not archive the story', 'error');
        }
      })();
      return;
    }
    archiveStory(id);
    show('Story archived', 'info');
  };

  const sendReply = async () => {
    if (!data) return;
    const text = replyDraft.trim();
    if (!text || sendingReply) return;
    if (!requireAuth('message_seller')) return;
    setSendingReply(true);
    if (DATA_MODE === 'live') {
      try {
        const frameId = data.story?.frames[frame]?.id;
        if (!frameId) throw new Error('missing frame id');
        await socialService.createPosterReply(frameId, {
          id: `reply_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`,
          body: text,
        });
      } catch {
        setSendingReply(false);
        show('Could not send the reply', 'error');
        return;
      }
    }
    try {
      const conversation = await createConversation.mutateAsync({
        memberIds: [data.authorId],
      });
      if (DATA_MODE === 'live') {
        await chatService.sendChatMessage(conversation.id, { text }, me?.id);
      } else {
        appendFixtureMessage(conversation.id, {
          id: `local-${Date.now()}`,
          senderId: me?.id ?? 'me',
          sender: 'me',
          text,
          type: 'text',
          timestamp: new Date().toISOString(),
          readStatus: 'sent',
        });
        const userKey = me?.id ?? 'guest';
        void queryClient.invalidateQueries({ queryKey: ['conversations', userKey] });
        void queryClient.invalidateQueries({
          queryKey: ['conversation', conversation.id, userKey],
        });
      }
      setReplyDraft('');
      router.push(`/inbox/${conversation.id}`);
    } catch {
      show(
        DATA_MODE === 'live'
          ? 'Reply sent — could not open the conversation'
          : 'Could not send the reply',
        'error',
      );
    } finally {
      setSendingReply(false);
    }
  };

  return {
    router,
    data,
    isLoading,
    isRemoved,
    slides,
    frameCount,
    frame,
    progress,
    paused,
    next,
    prev,
    onZoneDown,
    onZoneRelease,
    onZoneClick,
    tags,
    author,
    authorUsername,
    authorHref,
    isOwn,
    canReply,
    caption,
    expiresAt,
    hoursLeft,
    storyStatus,
    replyDraft,
    setReplyDraft,
    sendingReply,
    sendReply,
    optionsOpen,
    setOptionsOpen,
    confirm,
    setConfirm,
    sharePoster,
    copyLink,
    askDelete,
    archiveNow,
    wall,
  };
}
