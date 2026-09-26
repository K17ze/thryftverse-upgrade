'use client';

/**
 * LiveViewerOverlay — the Watch destination in fixture mode. The media
 * stage stays dominant (session cover fills the viewport); chrome is
 * restrained and over-canvas, mirroring the mobile viewer grammar:
 * top = seller identity + follow, live badge, viewer count, share, close;
 * bottom = chat column (collapsible panel on mobile), show title, pinned
 * product rail, heart reactions in a right action column. Escape or close
 * exits. The overlay owns presence — playback is a real-app concern.
 */

import { useEffect, useState } from 'react';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { userById } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { LiveBadge } from './LiveBadge';
import { LiveChatRail } from './LiveChatRail';
import { LiveProductRail } from './LiveProductRail';
import { LiveReactions } from './LiveReactions';
import { useLiveChat } from './useLiveChat';
import { useLivePresence } from './useLivePresence';
import { formatCount } from '@/lib/utils/format';

interface LiveViewerOverlayProps {
  session: LiveSession | null;
  onClose: () => void;
}

export function LiveViewerOverlay({ session, onClose }: LiveViewerOverlayProps) {
  const { show } = useToast();
  const { requireAuth, wall } = useSignupWall();
  const viewers = useLivePresence(session);
  const { messages, send } = useLiveChat(session);
  const [following, setFollowing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Per-session chrome resets when a different show opens.
  useEffect(() => {
    setFollowing(false);
    setChatOpen(false);
  }, [session?.id]);

  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [session, onClose]);

  if (!session) return null;
  const seller = userById(session.sellerId);
  const live = session.status === 'live';

  // Chat is an account-bound write — guests hit the wall on send, same
  // gate the follow and bag actions use. Replays pass send=null anyway.
  const sendGuarded = send
    ? (text: string) => {
        if (requireAuth('message_seller')) send(text);
      }
    : null;

  const share = async () => {
    const url = `${window.location.origin}/live`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: session.title, url });
        return;
      } catch {
        // Dismissed or unsupported — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      show('Show link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-overlay bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`${live ? 'Live' : 'Replay'} — ${session.title}`}
    >
      <AppImage
        src={session.coverUri}
        alt={session.title}
        fill
        priority
        className="h-full w-full"
        imgClassName="object-cover"
        sizes="100vw"
      />

      {/* Top chrome — seller identity + follow left; badge, viewers, share,
          close right. Mobile's LiveStreamTopChrome grammar. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar src={seller?.avatar} name={seller?.username} size={32} />
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-body-emphasis font-semibold text-scrim-text-primary">
              <span className="clamp-1">@{seller?.username ?? 'seller'}</span>
              {seller?.isVerified ? (
                <Icon name="verified" size={14} className="shrink-0 text-scrim-text-primary" filled />
              ) : null}
            </p>
            <p className="hidden text-meta text-scrim-text-secondary sm:block">
              {formatCount(seller?.followers)} followers
            </p>
          </div>
          <button
            type="button"
            aria-pressed={following}
            onClick={() => {
              if (!requireAuth('follow_seller')) return;
              setFollowing((f) => !f);
            }}
            className={`pressable ml-1 h-8 shrink-0 rounded-full px-3.5 text-caption font-semibold ${
              following
                ? 'bg-white/15 text-scrim-text-primary'
                : 'bg-scrim-text-primary text-black'
            }`}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {live ? (
            <>
              <LiveBadge />
              {viewers != null ? (
                <span className="tnum inline-flex items-center gap-1.5 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
                  <Icon name="eye" size={12} />
                  {formatCount(viewers)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-overlay px-2 py-1 text-meta font-semibold uppercase tracking-[0.08em] text-scrim-text-primary">
              <Icon name="play" size={12} filled />
              Replay · {session.durationMinutes} min
            </span>
          )}
          <IconButton name="share" aria-label="Share show" onMedia onClick={() => void share()} />
          <IconButton name="close" aria-label="Close" onMedia onClick={onClose} />
        </div>
      </div>

      {/* Bottom chrome — chat column (desktop), title, product rail, and
          the right action column: chat toggle (mobile) + heart reactions. */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-4 pt-28 sm:px-6 sm:pb-5">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex items-end gap-4">
            <div className="hidden w-[300px] shrink-0 self-end md:block lg:w-[340px]">
              <LiveChatRail
                messages={messages}
                onSend={sendGuarded}
                listClassName="max-h-[30vh] lg:max-h-[34vh]"
              />
            </div>
            <div className="min-w-0 flex-1" />
            <div className="flex shrink-0 flex-col items-center gap-1">
              <IconButton
                name="chat"
                aria-label={chatOpen ? 'Hide chat' : 'Show chat'}
                aria-expanded={chatOpen}
                onMedia
                onClick={() => setChatOpen((o) => !o)}
                className="md:hidden"
              />
              <LiveReactions session={session} />
            </div>
          </div>

          <h2 className="clamp-1 mt-3 text-body-emphasis font-semibold text-scrim-text-primary sm:mt-4 sm:text-item-title">
            {session.title}
          </h2>
          <div className="mt-2.5">
            <LiveProductRail session={session} />
          </div>
        </div>
      </div>

      {/* Mobile chat — on-canvas panel over the stage, same scrim grammar.
          Desktop keeps the always-on column above. */}
      {chatOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[58dvh] flex-col border-t border-white/10 bg-black/85 backdrop-blur-md md:hidden">
          <div className="flex items-center justify-between pb-1 pl-4 pr-1 pt-1.5">
            <span className="text-meta font-semibold uppercase tracking-[0.08em] text-scrim-text-secondary">
              {live ? 'Live chat' : 'Chat replay'}
            </span>
            <IconButton
              name="close"
              aria-label="Hide chat"
              onMedia
              onClick={() => setChatOpen(false)}
              className="h-9 w-9"
              size={18}
            />
          </div>
          <LiveChatRail
            messages={messages}
            onSend={sendGuarded}
            className="flex-1 px-4 pb-3"
            listClassName="max-h-none"
          />
        </div>
      ) : null}

      {wall}
    </div>
  );
}
