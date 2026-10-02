'use client';

interface MessageReplyQuoteProps {
  replyTo: { senderName: string; text: string } | null;
  replyToMessageId?: string;
  mine: boolean;
  onReplyPress?: (messageId: string) => void;
}

export function MessageReplyQuote({
  replyTo,
  replyToMessageId,
  mine,
  onReplyPress,
}: MessageReplyQuoteProps) {
  if (!replyTo) return null;

  const quote = (
    <>
      <p
        className={`text-meta font-semibold ${
          mine ? 'text-text-inverse' : 'text-brand'
        }`}
      >
        {replyTo.senderName}
      </p>
      <p
        className={`clamp-2 text-meta ${
          mine ? 'text-text-inverse/70' : 'text-text-secondary'
        }`}
      >
        {replyTo.text}
      </p>
    </>
  );

  if (onReplyPress) {
    return (
      <button
        type="button"
        onClick={() => {
          if (replyToMessageId) onReplyPress(replyToMessageId);
        }}
        aria-label="Jump to the original message"
        className={`pressable mb-1.5 block w-full border-l-2 py-0.5 pl-2 text-left ${
          mine ? 'border-text-inverse/50' : 'border-brand'
        }`}
      >
        {quote}
      </button>
    );
  }

  return (
    <div
      className={`mb-1.5 border-l-2 py-0.5 pl-2 ${
        mine ? 'border-text-inverse/50' : 'border-brand'
      }`}
    >
      {quote}
    </div>
  );
}
