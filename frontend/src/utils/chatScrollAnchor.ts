/**
 * Decide whether an incoming live message should auto-scroll the reader
 * to the bottom of the conversation.
 *
 * The rule: scroll only when the reader is already at the bottom (the
 * unread-below FAB is hidden) or the message is our own echo. A user who
 * scrolled up to read history keeps their position — the FAB carries the
 * new arrivals instead of yanking the viewport (F-chat-anchor).
 */
export function shouldAutoScrollOnIncomingMessage(opts: {
  isAtBottom: boolean;
  isOwnMessage: boolean;
}): boolean {
  return opts.isAtBottom || opts.isOwnMessage;
}
