'use client';

/**
 * MessagePrimitives — essential presentation atoms for chat bubbles:
 * timestamps, delivery receipts, match highlighting, linkified body text,
 * deleted-message tombstones, and quiet gutter actions.
 */

import type { Message } from '@/lib/contracts/domain';
import {
  capReceiptForPrivacy,
  useReadReceiptsEnabled,
} from '@/lib/store/chatPrefs';
import { Icon } from '@/components/ui/Icon';

/** Bubble meta time — shared with OfferCard so every message kind stamps the same way. */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Delivery receipt — the fixture-honest tick grammar on every own message:
 * clock while sending, single check sent, muted double check delivered,
 * full-strength double check read (capped by read receipts privacy settings).
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
 * Highlight — case-insensitive match marking for in-thread search.
 * The mark tint is passed in so it stays legible across all surface backgrounds.
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
      <mark
        key={`m-${key++}`}
        className={`rounded-sm px-0.5 text-inherit ${markClassName}`}
      >
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
 * that keeps the row legible while never leaking the original payload.
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
    <div
      className={`${tight ? 'mt-0.5' : 'mt-1.5'} flex ${
        mine ? 'justify-end' : 'justify-start'
      }`}
    >
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

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

/**
 * URLs in a message body become real clickable anchors while preserving search highlights.
 */
export function MessageText({
  text,
  query,
  mine,
  markClassName,
}: {
  text: string;
  query: string;
  mine: boolean;
  markClassName: string;
}) {
  const segments: { text: string; url?: string }[] = [];
  let from = 0;
  for (const match of text.matchAll(URL_RE)) {
    const at = match.index ?? 0;
    if (at > from) segments.push({ text: text.slice(from, at) });
    segments.push({ text: match[0], url: match[0] });
    from = at + match[0].length;
  }
  if (from < text.length) segments.push({ text: text.slice(from) });
  if (segments.length === 0) segments.push({ text });

  return (
    <>
      {segments.map((s, i) =>
        s.url ? (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className={`break-all underline underline-offset-2 ${
              mine
                ? 'decoration-text-inverse/60 hover:decoration-text-inverse'
                : 'text-brand decoration-brand/60 hover:decoration-brand'
            }`}
          >
            <Highlight text={s.text} query={query} markClassName={markClassName} />
          </a>
        ) : (
          <Highlight key={i} text={s.text} query={query} markClassName={markClassName} />
        ),
      )}
    </>
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
  /** Opens the react/actions menu anchored at the button — the gutter
   *  entry point to the same menu long-press opens. */
  onReact,
}: {
  mine: boolean;
  onReply?: () => void;
  onCopy?: () => void;
  onReact?: (anchor: { x: number; y: number }) => void;
}) {
  if (!onReply && !onCopy && !onReact) return null;

  // Each button manages its own reveal — a group-hover or its own
  // focus-visible flips pointer events + opacity (a shared container
  // opacity would swallow the focus state).
  const btn =
    'pointer-events-none flex h-11 items-center rounded-md px-2 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted opacity-0 transition-opacity duration-150 hover:text-text-primary focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100';

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
        <button
          type="button"
          onClick={onReply}
          aria-label="Reply to this message"
          className={btn}
        >
          Reply
        </button>
      ) : null}
      {onCopy ? (
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy message text"
          className={btn}
        >
          Copy
        </button>
      ) : null}
    </div>
  );
}

/** Cluster position inside a same-sender run — single stands alone. */
export type MessageCluster = 'single' | 'first' | 'middle' | 'last';
