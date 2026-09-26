'use client';

/**
 * MessageBubble — port of mobile MessageBubble.
 * 20px chat radius with an asymmetric tail corner; mine = brand ink right,
 * theirs = surfaceAlt left. Meta row (time + delivery receipt) lives inside
 * the bubble; "Seen" sits under the last read outgoing message.
 * System messages render as a centered caption. Group threads label the
 * sender above incoming cluster-first bubbles. Media messages render the
 * attachment (4:3 remote via AppImage, intrinsic for local blob picks).
 * Text bubbles carry a quiet hover/focus copy action (clipboard + toast).
 */

import type { Message } from '@/lib/contracts/domain';
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
  if (!status) return null;
  if (status === 'sending') {
    return <Icon name="clock" size={11} aria-label="Sending" />;
  }
  if (status === 'sent') {
    return <Icon name="check" size={12} aria-label="Sent" />;
  }
  const read = status === 'read';
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

/** blob:/data: URIs come from the local file picker — next/image can't
 *  optimize them, so they render through a plain img. */
function isLocalMediaUri(uri: string): boolean {
  return uri.startsWith('blob:') || uri.startsWith('data:');
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
}

export function MessageBubble({ message: m, mine, showSeen, senderLabel, highlight }: MessageBubbleProps) {
  const toast = useToast();

  if (m.isSystem || m.type === 'system' || m.sender === 'system') {
    return (
      <p className="my-3 px-6 text-center text-meta text-text-muted">
        {m.systemTitle ?? m.text}
      </p>
    );
  }

  const time = formatMessageTime(m.timestamp);
  const mediaOnly = !!m.mediaUri && !m.text;

  const copyText = async () => {
    if (!m.text) return;
    try {
      await navigator.clipboard.writeText(m.text);
      toast.show('Message copied', 'success');
    } catch {
      toast.show("Couldn't copy — clipboard access was blocked", 'error');
    }
  };

  return (
    <div className={`group/msg relative mt-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
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
              ? 'rounded-br-sm bg-brand text-text-inverse'
              : 'rounded-bl-sm bg-surface-alt text-text-primary'
          }`}
        >
          {m.mediaUri ? (
            isLocalMediaUri(m.mediaUri) ? (
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
            } ${mine ? 'text-text-inverse/60' : 'text-text-muted'}`}
          >
            {time ? <span className="text-micro">{time}</span> : null}
            {mine ? <MessageReceipt status={m.readStatus} /> : null}
          </div>
        </div>
        {mine && showSeen ? (
          <p className="mt-0.5 text-right text-meta text-text-muted">Seen</p>
        ) : null}
        {/* Quiet copy action — WhatsApp's hover affordance. Anchored to the
            bubble stack in the outer gutter so text layout never shifts;
            keyboard focus reveals it the same as hover. */}
        {m.text ? (
          <button
            type="button"
            onClick={copyText}
            aria-label="Copy message text"
            className={`pointer-events-none absolute top-1/2 z-[1] -translate-y-1/2 opacity-0 transition-opacity duration-150 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 ${
              mine ? 'right-full mr-1' : 'left-full ml-1'
            } flex h-11 items-center rounded-md px-2 text-micro font-semibold uppercase tracking-wide text-text-muted hover:text-text-primary`}
          >
            Copy
          </button>
        ) : null}
      </div>
    </div>
  );
}
