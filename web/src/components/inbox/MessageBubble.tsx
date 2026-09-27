'use client';

/**
 * MessageBubble — port of mobile MessageBubble.
 * 20px chat radius with an asymmetric tail corner; mine = brand ink right,
 * theirs = surfaceAlt left. Meta row (Edited marker, time, delivery
 * receipt) lives inside the bubble; "Seen" sits under the last read
 * outgoing message. System messages render as a centered caption; deleted
 * messages render a legible tombstone that never leaks the old payload.
 * Group threads label the sender above cluster-first incoming bubbles.
 * Reactions overlap the bubble's bottom edge as emoji chips (the emoji is
 * message content, not chrome). Reply quotes ride inside the bubble top —
 * a press jumps to the parent message — media renders the attachment
 * (images via AppImage/img, video through a native player with its poster
 * still), voice shows a play toggle with the server waveform, documents
 * render a download row — every mapped kind gets its honest surface.
 * Cluster grammar: same-sender runs tighten to a 2px gap and only the
 * run's last bubble carries the tail corner (Instagram's pressure
 * clusters). Hover/focus reveals the quiet gutter actions — the web's
 * equivalent of the mobile swipe-to-reply + long-press copy.
 */

import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/contracts/domain';
import { EXTENDED_REACTIONS } from '@/lib/hooks/chat-queries';
import { isLocalMediaUri } from '@/lib/utils/media';
import {
  capReceiptForPrivacy,
  useReadReceiptsEnabled,
} from '@/lib/store/chatPrefs';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

/** Bubble meta time — shared with OfferCard so every message kind stamps
 *  the same way. */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Delivery receipt — the fixture-honest tick grammar on every own message,
 * not just the last: clock while sending, single check sent, muted double
 * check delivered, full-strength double check read (matching the row glyph
 * and the mobile readReceipt treatment — the "Seen" caption still only
 * lands under the final read outgoing message).
 */
export function MessageReceipt({
  status,
  readClassName = 'text-text-inverse',
}: {
  status?: Message['readStatus'];
  /** Read-tick tint — full inverse on the brand bubble, brand on a card. */
  readClassName?: string;
}) {
  // Read receipts off → the viewer's own ticks stop at "delivered". The
  // cap lives here (the single point every surface shares — bubbles,
  // offer cards, listing shares) so no renderer can overclaim a read.
  const receiptsEnabled = useReadReceiptsEnabled();
  const effective = capReceiptForPrivacy(status, receiptsEnabled);
  if (!effective) return null;
  if (effective === 'sending') {
    return <Icon name="clock" size={11} aria-label="Sending" />;
  }
  if (status === 'sent') {
    return <Icon name="check" size={12} aria-label="Sent" />;
  }
  const read = effective === 'read';
  return (
    <span
      className={`inline-flex ${read ? readClassName : ''}`}
      aria-label={read ? 'Read' : 'Delivered'}
    >
      <Icon name="check" size={12} />
      <Icon name="check" size={12} className="-ml-[9px]" />
    </span>
  );
}

/**
 * Highlight — case-insensitive match marking for in-thread search. The
 * mark tint is passed in so it stays legible on both bubble inks (brand
 * ink for own messages, surface-alt for theirs, surface for cards).
 */
export function Highlight({
  text,
  query,
  markClassName = 'bg-brand-subtle',
}: {
  text: string;
  query: string;
  markClassName?: string;
}) {
  const needle = query.trim().toLowerCase();
  if (!needle) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  let key = 0;
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={`m-${key++}`} className={`rounded-sm px-0.5 text-inherit ${markClassName}`}>
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

/**
 * Tombstone for a deleted-for-everyone message — an outlined, muted pill
 * that keeps the row legible while never leaking the original payload
 * (Instagram's "message deleted" grammar). Shared with the offer and
 * listing-share branches so a deleted card degrades the same way.
 */
export function DeletedMessageTombstone({
  mine,
  senderLabel,
  tight,
}: {
  mine: boolean;
  senderLabel?: string;
  /** Clustered run member — 2px gap instead of the section gap. */
  tight?: boolean;
}) {
  return (
    <div className={`${tight ? 'mt-0.5' : 'mt-1.5'} flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[78%] md:max-w-[65%]">
        {!mine && senderLabel ? (
          <p className="mb-0.5 ml-2 text-meta font-semibold text-text-secondary">
            {senderLabel}
          </p>
        ) : null}
        <p className="flex items-center gap-1.5 rounded-chat border border-border px-3.5 py-2 text-body italic text-text-muted">
          <Icon name="ban" size={13} className="shrink-0" aria-hidden />
          {mine ? 'You deleted this message' : 'This message was deleted'}
        </p>
      </div>
    </div>
  );
}

/** m:ss for voice durations — 0:00 renders as "0:00" stays honest. */
function formatVoiceDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Voice message — play/pause toggle driving a hidden audio element, the
 * server waveform rendered as bars when present, duration when known.
 * A voice row with no URI and no duration falls back to the plain label
 * rather than a dead control.
 */
function VoiceAttachment({ m, mine }: { m: Message; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const duration = m.voiceDurationMs != null ? formatVoiceDuration(m.voiceDurationMs) : '';
  const bars = (m.voiceWaveform ?? []).slice(0, 36);
  const playable = Boolean(m.voiceUri);
  const metaTone = mine ? 'text-text-inverse/80' : 'text-text-muted';

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else void a.play();
  };

  return (
    <span className="flex min-w-[150px] items-center gap-2 py-0.5">
      {playable ? (
        <>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? 'Pause voice message' : 'Play voice message'}
            className="pressable -m-1.5 flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                mine ? 'bg-text-inverse text-brand' : 'bg-brand text-text-inverse'
              }`}
            >
              <Icon name={playing ? 'pause' : 'play'} size={14} filled />
            </span>
          </button>
          <audio
            ref={audioRef}
            src={m.voiceUri}
            preload="none"
            className="hidden"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        </>
      ) : (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            mine ? 'bg-text-inverse/20 text-text-inverse' : 'bg-surface text-text-muted'
          }`}
        >
          <Icon name="mic" size={14} />
        </span>
      )}
      {bars.length > 0 ? (
        <span className="flex h-7 min-w-0 flex-1 items-center gap-[2px]" aria-hidden>
          {bars.map((v, i) => (
            <span
              key={i}
              className={`w-[2px] shrink-0 rounded-full ${mine ? 'bg-text-inverse/60' : 'bg-text-muted'}`}
              style={{ height: `${Math.min(100, Math.max(12, v <= 1 ? v * 100 : v))}%` }}
            />
          ))}
        </span>
      ) : (
        <span className={`text-meta ${metaTone}`}>Voice message</span>
      )}
      {duration ? <span className={`tnum shrink-0 text-meta ${metaTone}`}>{duration}</span> : null}
    </span>
  );
}

/** Document attachment — file row with name, mime and a download affordance. */
function DocumentAttachment({ m, mine }: { m: Message; mine: boolean }) {
  const cls = `flex min-w-[170px] items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
    mine ? 'border-text-inverse/40' : 'border-border'
  }`;
  const inner = (
    <>
      <Icon
        name="document"
        size={20}
        className={`shrink-0 ${mine ? 'text-text-inverse' : 'text-brand'}`}
      />
      <span className="min-w-0 flex-1">
        <span className="clamp-1 block text-body font-medium">
          {m.documentName ?? 'Document'}
        </span>
        {m.documentMimeType ? (
          <span className={`clamp-1 block text-meta ${mine ? 'text-text-inverse/70' : 'text-text-muted'}`}>
            {m.documentMimeType}
          </span>
        ) : null}
      </span>
      <Icon
        name="download"
        size={14}
        className={`shrink-0 ${mine ? 'text-text-inverse/70' : 'text-text-muted'}`}
      />
    </>
  );
  return m.documentUri ? (
    <a
      href={m.documentUri}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open document ${m.documentName ?? ''}`.trim()}
      className={cls}
    >
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

/**
 * Quiet hover/focus gutter actions — the desktop answer to the mobile
 * swipe-to-reply + long-press menu. Rendered beside the bubble, never
 * inside it, so text layout never shifts; hover and keyboard focus reveal
 * them the same way. `mine` flips the gutter to the leading side with the
 * primary action hugging the bubble edge.
 */
export function MessageActions({
  mine,
  onReply,
  onCopy,
  onReact,
}: {
  mine: boolean;
  onReply?: () => void;
  onCopy?: () => void;
  /** Opens the react/actions menu anchored at the button — the gutter
   *  entry point to the same menu long-press opens. */
  onReact?: (anchor: { x: number; y: number }) => void;
}) {
  if (!onReply && !onCopy && !onReact) return null;
  // Each button manages its own reveal — a group-hover or its own
  // focus-visible flips pointer events + opacity (a shared container
  // opacity would swallow the focus state).
  const btn =
    'pointer-events-none flex h-11 items-center rounded-md px-2 text-micro font-semibold uppercase tracking-wide text-text-muted opacity-0 transition-opacity duration-150 hover:text-text-primary focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100';
  return (
    <div
      className={`absolute top-1/2 z-[1] flex -translate-y-1/2 ${
        mine ? 'right-full mr-1 flex-row-reverse' : 'left-full ml-1'
      }`}
    >
      {onReact ? (
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onReact({ x: mine ? r.left : r.right, y: r.bottom });
          }}
          aria-label="React to this message"
          aria-haspopup="menu"
          className={btn}
        >
          React
        </button>
      ) : null}
      {onReply ? (
        <button type="button" onClick={onReply} aria-label="Reply to this message" className={btn}>
          Reply
        </button>
      ) : null}
      {onCopy ? (
        <button type="button" onClick={onCopy} aria-label="Copy message text" className={btn}>
          Copy
        </button>
      ) : null}
    </div>
  );
}

/** Cluster position inside a same-sender run — single stands alone. */
export type MessageCluster = 'single' | 'first' | 'middle' | 'last';

/** A reactable emoji + the viewer's current state on it. */
export interface MenuReaction {
  emoji: string;
  reactedByMe: boolean;
}

/**
 * Press-and-hold / right-click action menu — the touch + desktop
 * equivalent of the mobile long-press sheet. Renders at the press point,
 * clamped inside the viewport; outside-press and Escape dismiss. A
 * quick-react row heads the menu when the caller supplies it (the mobile
 * MessageContextMenu emoji row — "+" expands to the extended 18-emoji
 * set), then the action grammar in the mobile order: Retry (failed
 * sends), Reply, Forward, Save in chat, Edit, Copy, Report (incoming),
 * Delete for me / Delete for everyone — actions only render for the
 * props the caller wired, so a message kind that can't forward never
 * shows a dead control. Keyboard-operable: focus lands on the first
 * item, arrows rove, Escape or an item pick closes and returns focus to
 * whatever opened the menu — scroll, outside-press and Tab dismissals
 * don't refocus, so closing can't drag the stream back to the trigger.
 */
export function MessageActionsMenu({
  anchor,
  reactions,
  onReact,
  hasReacted,
  onRetry,
  onReply,
  onForward,
  onPin,
  pinned,
  saved,
  onSave,
  onCopy,
  onEdit,
  onReport,
  onRemove,
  onDeleteForMe,
  onDeleteForEveryone,
  onClose,
}: {
  anchor: { x: number; y: number };
  /** Quick-react row — reflects reactedByMe so a second tap removes. */
  reactions?: MenuReaction[];
  onReact?: (emoji: string) => void;
  /** reactedByMe lookup for the expanded emoji grid (the quick row's own
   *  `reactions` prop only covers the default six). */
  hasReacted?: (emoji: string) => boolean;
  /** Failed outgoing send — the mobile Retry row. */
  onRetry?: () => void;
  onReply?: () => void;
  onForward?: () => void;
  /** Group-admin pin toggle — the label flips on `pinned`; absent for
   *  DMs and non-admins (the backend only permits admin/owner writes). */
  onPin?: () => void;
  pinned?: boolean;
  /** Shared saved state — the label flips to "Unsave" when the viewer
   *  has it saved (mobile's isSaved label grammar). */
  saved?: boolean;
  onSave?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
  onReport?: () => void;
  /** Discard a failed pending send — local only, no server edge. */
  onRemove?: () => void;
  onDeleteForMe?: () => void;
  onDeleteForEveryone?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // "+" expander — the mobile EmojiReactionsBar extended set toggle.
  const [moreOpen, setMoreOpen] = useState(false);
  // Focus restore — the element that held focus before the menu opened
  // gets it back on unmount, but only for Escape / item picks. Scroll
  // and outside-press dismissals leave focus alone: focusing the opener
  // while the user scrolls would drag the stream back to the trigger
  // (the same dismiss-vs-interrupt split the overlay menus use).
  const restoreFocus = useRef<Element | null>(null);
  const restoreOnClose = useRef(false);
  if (restoreFocus.current === null && typeof document !== 'undefined') {
    restoreFocus.current = document.activeElement;
  }

  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        restoreOnClose.current = true;
        onClose();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  // Focus the first item on open; on unmount, restore the opener's focus
  // only when the dismissal asked for it (Escape / item pick).
  useEffect(() => {
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]');
    first?.focus();
    const prev = restoreFocus.current;
    return () => {
      if (restoreOnClose.current && prev instanceof HTMLElement) prev.focus();
    };
  }, []);

  const focusables = (): HTMLElement[] =>
    Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemradio"]',
      ) ?? [],
    );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      // Menu grammar: Tab exits the menu and continues the page sequence —
      // it must not leave an open menu behind (the FeedItemMenu fix).
      // Focus is moved back to the element that opened the menu first so
      // the browser's default tab step (kept — no preventDefault) proceeds
      // from it rather than from a detached menu item.
      const prev = restoreFocus.current;
      onClose();
      if (prev instanceof HTMLElement) prev.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') {
      return;
    }
    e.preventDefault();
    const items = focusables();
    if (!items.length) return;
    const at = items.findIndex((el) => el === document.activeElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : e.key === 'ArrowDown'
            ? (at + 1) % items.length
            : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const item =
    'pressable flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-body text-text-primary hover:bg-row-pressed focus-visible:bg-row-pressed focus-visible:outline-none';
  const pick = (fn?: () => void) => () => {
    // An item pick is a deliberate dismissal — focus returns to the
    // opener, same as Escape.
    restoreOnClose.current = true;
    fn?.();
    onClose();
  };

  const rows = [
    onRetry,
    onReply,
    onForward,
    onPin,
    onSave,
    onEdit,
    onCopy,
    onReport,
    onRemove,
    onDeleteForMe,
    onDeleteForEveryone,
  ].filter(Boolean).length;
  const reactable = Boolean(reactions?.length && onReact);
  const width = reactable ? 232 : 176;
  // Rough height estimate for viewport clamping — reaction row, the
  // expanded emoji grid when open, then items.
  const estHeight =
    8 + (reactable ? 52 : 0) + (reactable && moreOpen ? 124 : 0) + rows * 44;
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(anchor.y, window.innerHeight - estHeight - 8));

  const reactChip = (emoji: string, reactedByMe: boolean) => (
    <button
      key={emoji}
      type="button"
      role="menuitemradio"
      aria-checked={reactedByMe}
      aria-label={`React ${emoji}`}
      onClick={pick(() => onReact?.(emoji))}
      className={`pressable flex h-9 w-9 items-center justify-center rounded-full text-body-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        reactedByMe ? 'bg-brand-subtle' : 'hover:bg-surface-alt'
      }`}
    >
      <span aria-hidden>{emoji}</span>
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Message actions"
      onKeyDown={onKeyDown}
      className="fixed z-dropdown overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
      style={{ left, top, width }}
    >
      {reactable ? (
        <div className="border-b border-border-subtle px-2 pb-1.5 pt-1">
          <div role="group" aria-label="React with" className="flex items-center justify-between">
            {reactions?.map((r) => reactChip(r.emoji, r.reactedByMe))}
            {/* "+" expander — the mobile EmojiReactionsBar affordance:
                toggles the extended emoji grid without closing the menu. */}
            <button
              type="button"
              role="menuitem"
              aria-expanded={moreOpen}
              aria-label={moreOpen ? 'Fewer reactions' : 'More reactions'}
              onClick={() => setMoreOpen((v) => !v)}
              className={`pressable flex h-9 w-9 items-center justify-center rounded-full text-body-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                moreOpen ? 'bg-brand-subtle text-brand' : 'text-text-muted hover:bg-surface-alt'
              }`}
            >
              <span aria-hidden>{moreOpen ? '×' : '+'}</span>
            </button>
          </div>
          {moreOpen ? (
            <div
              role="group"
              aria-label="More reactions"
              className="mt-1.5 flex flex-wrap gap-0.5 border-t border-border-subtle pt-1.5"
            >
              {EXTENDED_REACTIONS.map((emoji) =>
                reactChip(emoji, hasReacted?.(emoji) ?? false),
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {onRetry ? (
        <button type="button" role="menuitem" className={item} onClick={pick(onRetry)}>
          Retry
        </button>
      ) : null}
      {onReply ? (
        <button type="button" role="menuitem" className={item} onClick={pick(onReply)}>
          Reply
        </button>
      ) : null}
      {onForward ? (
        <button type="button" role="menuitem" className={item} onClick={pick(onForward)}>
          Forward
        </button>
      ) : null}
      {onPin ? (
        <button type="button" role="menuitem" className={item} onClick={pick(onPin)}>
          {pinned ? 'Unpin message' : 'Pin message'}
        </button>
      ) : null}
      {onSave ? (
        <button type="button" role="menuitem" className={item} onClick={pick(onSave)}>
          {saved ? 'Unsave' : 'Save in chat'}
        </button>
      ) : null}
      {onEdit ? (
        <button type="button" role="menuitem" className={item} onClick={pick(onEdit)}>
          Edit message
        </button>
      ) : null}
      {onCopy ? (
        <button type="button" role="menuitem" className={item} onClick={pick(onCopy)}>
          Copy
        </button>
      ) : null}
      {onReport ? (
        <button
          type="button"
          role="menuitem"
          className={`${item} text-danger-text`}
          onClick={pick(onReport)}
        >
          Report
        </button>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          role="menuitem"
          className={`${item} text-danger-text`}
          onClick={pick(onRemove)}
        >
          Remove
        </button>
      ) : null}
      {onDeleteForMe ? (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={pick(onDeleteForMe)}
        >
          Delete for me
        </button>
      ) : null}
      {onDeleteForEveryone ? (
        <button
          type="button"
          role="menuitem"
          className={`${item} text-danger-text`}
          onClick={pick(onDeleteForEveryone)}
        >
          Delete for everyone
        </button>
      ) : null}
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  mine: boolean;
  /** True for the final outgoing message once it's read — shows "Seen". */
  showSeen?: boolean;
  /** Group threads: sender name shown above cluster-first incoming bubbles. */
  senderLabel?: string;
  /** In-thread search query — matching text is marked inside the bubble. */
  highlight?: string;
  /** Resolved reply preview — the caller looks up replyToMessageId. */
  replyTo?: { senderName: string; text: string } | null;
  /** Press on the reply quote — jumps to the parent message. */
  onReplyPress?: () => void;
  /** Reply affordance — the caller stages the quoted compose bar. */
  onReply?: () => void;
  /** Opens the actions menu (quick-react row) anchored at the gutter button. */
  onReact?: (anchor: { x: number; y: number }) => void;
  /** Tapping a reaction chip toggles the viewer's reaction on that emoji. */
  onToggleReaction?: (emoji: string) => void;
  /** Tap on the inline photo/video — opens the shared media lightbox
   *  paged to this attachment (mobile ChatMediaPreviewScreen parity). */
  onMediaPress?: (message: Message) => void;
  /** Failed outgoing send — the sending clock would lie (the write
   *  already failed); the caller renders the "Not delivered" affordance,
   *  the receipt suppresses. */
  failed?: boolean;
  /** Same-sender run position — tightens the gap, tails the last bubble. */
  cluster?: MessageCluster;
}

export function MessageBubble({
  message: m,
  mine,
  showSeen,
  senderLabel,
  highlight,
  replyTo,
  onReplyPress,
  onReply,
  onReact,
  onToggleReaction,
  onMediaPress,
  failed,
  cluster = 'single',
}: MessageBubbleProps) {
  const toast = useToast();
  const receiptsEnabled = useReadReceiptsEnabled();

  if (m.isSystem || m.type === 'system' || m.sender === 'system') {
    return (
      <p className="my-3 px-6 text-center text-meta text-text-muted">
        {m.systemTitle ?? m.text}
      </p>
    );
  }

  if (m.isDeleted) {
    return <DeletedMessageTombstone mine={mine} senderLabel={senderLabel} />;
  }

  const time = formatMessageTime(m.timestamp);
  const isVideo = m.mediaType === 'video';
  const mediaOnly = Boolean(m.mediaUri) && !m.text;
  const reactions = m.reactions ?? [];
  const metaTone = mine ? 'text-text-inverse/60' : 'text-text-muted';
  // Cluster grammar — same-sender runs tighten to a 2px gap; the tail
  // corner belongs to the run's final bubble only.
  const tight = cluster === 'middle' || cluster === 'last';
  const tail = cluster === 'single' || cluster === 'last';

  const copyText = async () => {
    if (!m.text) return;
    try {
      await navigator.clipboard.writeText(m.text);
      toast.show('Message copied', 'success');
    } catch {
      toast.show("Couldn't copy — clipboard access was blocked", 'error');
    }
  };

  const quote = replyTo ? (
    <>
      <p className={`text-meta font-semibold ${mine ? 'text-text-inverse' : 'text-brand'}`}>
        {replyTo.senderName}
      </p>
      <p
        className={`clamp-2 text-meta ${mine ? 'text-text-inverse/70' : 'text-text-secondary'}`}
      >
        {replyTo.text}
      </p>
    </>
  ) : null;

  return (
    <div className={`group/msg relative ${tight ? 'mt-0.5' : 'mt-1.5'} flex ${reactions.length > 0 ? 'mb-3' : ''} ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="relative max-w-[78%] md:max-w-[65%]">
        {!mine && senderLabel ? (
          <p className="mb-0.5 ml-2 text-meta font-semibold text-text-secondary">
            {senderLabel}
          </p>
        ) : null}
        <div
          className={`rounded-chat ${
            mediaOnly ? 'p-1.5' : 'px-3.5 py-2'
          } ${
            mine
              ? `${tail ? 'rounded-br-sm' : ''} bg-brand text-text-inverse`
              : `${tail ? 'rounded-bl-sm' : ''} bg-surface-alt text-text-primary`
          }`}
        >
          {replyTo ? (
            onReplyPress ? (
              <button
                type="button"
                onClick={onReplyPress}
                aria-label="Jump to the original message"
                className={`pressable mb-1.5 block w-full border-l-2 py-0.5 pl-2 text-left ${
                  mine ? 'border-text-inverse/50' : 'border-brand'
                }`}
              >
                {quote}
              </button>
            ) : (
              <div
                className={`mb-1.5 border-l-2 py-0.5 pl-2 ${
                  mine ? 'border-text-inverse/50' : 'border-brand'
                }`}
              >
                {quote}
              </div>
            )
          ) : null}
          {m.mediaUri ? (
            onMediaPress ? (
              // Tap → fullscreen lightbox (mobile ChatMediaPreviewScreen).
              // The video renders inert inside the press target — playback
              // lives in the lightbox's real controls player.
              <button
                type="button"
                onClick={() => onMediaPress(m)}
                aria-label={isVideo ? 'Play video' : 'View photo'}
                className="pressable relative -mx-1 -mb-0.5 block"
              >
                {isVideo ? (
                  <span className="relative block">
                    <video
                      src={m.mediaUri}
                      poster={m.posterUri}
                      preload="metadata"
                      className="pointer-events-none mb-1 max-h-72 w-full max-w-[320px] rounded-2xl bg-black"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 mb-1 flex items-center justify-center rounded-2xl"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-media-overlay-scrim text-scrim-text-primary">
                        <Icon name="play" size={18} filled />
                      </span>
                    </span>
                  </span>
                ) : isLocalMediaUri(m.mediaUri) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable
                  <img
                    src={m.mediaUri}
                    alt="Shared media"
                    className="mb-1 max-h-72 w-full max-w-[320px] rounded-2xl object-cover"
                  />
                ) : (
                  <AppImage
                    src={m.mediaUri}
                    alt="Shared media"
                    aspectRatio={4 / 3}
                    sizes="320px"
                    className={`${mediaOnly ? '' : 'mb-1'} rounded-2xl`}
                  />
                )}
              </button>
            ) : isVideo ? (
              // Video rides a native player — poster still when the server
              // supplies one (the mediaUri may be an HLS playlist).
              <video
                src={m.mediaUri}
                poster={m.posterUri}
                controls
                preload="metadata"
                className="mb-1 max-h-72 w-full max-w-[320px] rounded-2xl bg-black"
              />
            ) : isLocalMediaUri(m.mediaUri) ? (
              // eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable
              <img
                src={m.mediaUri}
                alt="Shared media"
                className="mb-1 max-h-72 w-full max-w-[320px] rounded-2xl object-cover"
              />
            ) : (
              <AppImage
                src={m.mediaUri}
                alt="Shared media"
                aspectRatio={4 / 3}
                sizes="320px"
                className={`${mediaOnly ? '' : 'mb-1'} rounded-2xl`}
              />
            )
          ) : null}
          {m.type === 'voice' || m.voiceUri ? <VoiceAttachment m={m} mine={mine} /> : null}
          {m.type === 'document' || m.documentUri ? <DocumentAttachment m={m} mine={mine} /> : null}
          {m.text ? (
            <p className="whitespace-pre-wrap break-words text-body">
              <Highlight
                text={m.text}
                query={highlight ?? ''}
                markClassName={mine ? 'bg-brand-pressed' : 'bg-brand-subtle'}
              />
            </p>
          ) : null}
          <div
            className={`mt-0.5 flex items-center justify-end gap-1 ${
              mediaOnly ? 'px-1.5 pb-0.5' : ''
            } ${metaTone}`}
          >
            {m.isEdited ? <span className="text-micro">Edited</span> : null}
            {time ? <span className="text-micro">{time}</span> : null}
            {/* A failed send keeps its 'sending' readStatus — the clock
                would claim in-flight on a write that already failed; the
                "Not delivered" affordance below the bubble carries it. */}
            {mine && !failed ? <MessageReceipt status={m.readStatus} /> : null}
          </div>
        </div>
        {mine && showSeen && receiptsEnabled ? (
          <p className="mt-0.5 text-right text-meta text-text-muted">Seen</p>
        ) : null}
        {/* Reaction chips — the message's emoji content, overlapped on the
            bubble's bottom edge like the mobile reaction badge. Max three
            shown; the row reserves space so the next message isn't covered.
            When the caller wires the reaction edge the chips are real
            toggle buttons — tap adds/removes the viewer's own reaction. */}
        {reactions.length > 0 ? (
          <div
            className={`absolute -bottom-2.5 z-[1] flex gap-1 ${mine ? 'right-2' : 'left-2'}`}
            aria-label={`${reactions.length} reaction${reactions.length === 1 ? '' : 's'}`}
          >
            {reactions.slice(0, 3).map((r, i) => {
              const count = r.count ?? r.userIds.length;
              const chipCls = `flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 leading-none ${
                r.reactedByMe
                  ? 'border-brand bg-brand-subtle'
                  : 'border-border-subtle bg-surface-elevated'
              }`;
              const inner = (
                <>
                  <span className="text-meta" aria-hidden>{r.emoji}</span>
                  {count > 1 ? (
                    <span className="tnum text-micro font-semibold text-text-secondary">
                      {count}
                    </span>
                  ) : null}
                </>
              );
              return onToggleReaction ? (
                <button
                  key={`${r.emoji}-${i}`}
                  type="button"
                  onClick={() => onToggleReaction(r.emoji)}
                  aria-pressed={r.reactedByMe === true}
                  aria-label={`${r.emoji} reaction${count > 1 ? ` — ${count} people` : ''}`}
                  className={`pressable relative ${chipCls} after:absolute after:-inset-1.5 after:content-['']`}
                >
                  {inner}
                </button>
              ) : (
                <span key={`${r.emoji}-${i}`} className={chipCls}>
                  {inner}
                </span>
              );
            })}
          </div>
        ) : null}
        {/* Quiet gutter actions — react, reply (swipe-reply's desktop
            analogue) and copy. Anchored beside the bubble stack so text
            layout never shifts; hover and keyboard focus reveal them the
            same way. */}
        <MessageActions
          mine={mine}
          onReply={onReply}
          onCopy={m.text ? copyText : undefined}
          onReact={onReact}
        />
      </div>
    </div>
  );
}
