import type { Message } from '../../domain';
import type { InboxDeliveryStatus } from '../chat/InboxConversationRow';
import { formatActivityTimestamp } from '../../utils/dateFormat';

// Inbox timestamps arrive in mixed formats: ISO strings from the API and
// optimistic labels like "just now" written by local appends. Render a
// compact relative timestamp (time-of-day today, short date otherwise) and
// pass through any non-parseable label verbatim rather than showing nothing.
export function formatInboxTimestamp(value: string): string {
  if (!value) return '';
  return formatActivityTimestamp(value) || value;
}

// Delivery state is only shown when it is provable: the last stored message
// must be authored by the current user and carry a lifecycle status or read
// receipt. A synthetic preview row (system placeholder from the list fetch)
// or a message from the other participant yields no glyph — the row never
// claims "sent"/"read" for state it cannot verify.
export function deriveInboxDeliveryStatus(message?: Message): InboxDeliveryStatus | undefined {
  if (!message || message.sender !== 'me') return undefined;
  if (message.status === 'failed' || message.uploadStatus === 'failed') return 'failed';
  if (
    message.status === 'sending' ||
    message.status === 'reconciling' ||
    message.status === 'draft' ||
    message.uploadStatus === 'uploading'
  ) {
    return 'sending';
  }
  if (message.readStatus === 'read') return 'read';
  if (message.readStatus === 'delivered') return 'delivered';
  return 'sent';
}
