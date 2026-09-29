/**
 * Support fixtures — resolution-centre seed data for the web support hub.
 * Four cases covering the canonical shapes: an in-review order issue, a
 * resolved refund awaiting acceptance, an open verification case, and a
 * closed case with submitted CSAT. Dates live in the fixture world (Sep 2026)
 * and are deterministic so SSR and client render identically.
 */

import type {
  SupportAuthorRole,
  SupportTicket,
  SupportTicketMessage,
} from '@/lib/contracts/support';
import { listingById } from '@/lib/data/fixtures';

/**
 * Long-thread helper — a transcript of (role, body) pairs spaced `gapMin`
 * apart from `startIso`, so fixture threads stay deterministic while still
 * exercising thread pagination (> 20 messages).
 */
function thread(
  idPrefix: string,
  startIso: string,
  gapMin: number,
  lines: Array<[SupportAuthorRole, string, string | null]>,
): SupportTicketMessage[] {
  const start = new Date(startIso).getTime();
  return lines.map(([role, body, authorName], i) => ({
    id: `${idPrefix}-m${i + 1}`,
    role,
    authorName,
    body,
    createdAt: new Date(start + i * gapMin * 60_000).toISOString(),
    status: 'sent' as const,
  }));
}

export const SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: 'tv-48213',
    ref: 'TV-48213',
    conversationId: null,
    topicId: 'order_issue',
    topicLabel: 'Order issue',
    orderId: 'ord-1042',
    contextLinks: [{ kind: 'listing', id: 'l6' }],
    status: 'in_review',
    priority: 'high',
    messages: [
      {
        id: 'm-1',
        role: 'customer',
        authorName: null,
        body: 'Order ord-1042 was collected on the 24th but tracking hasn\'t scanned since it left the depot. It was due yesterday and the seller hasn\'t replied to my message.',
        createdAt: '2026-09-26T08:12:00Z',
        status: 'sent',
      },
      {
        id: 'm-2',
        role: 'agent_ai',
        authorName: 'ThryftVerse Assistant',
        body: 'Sorry about the silence — I\'ve pulled the tracking history and flagged this to Buyer Protection so you don\'t lose the window.',
        createdAt: '2026-09-26T08:14:00Z',
        status: 'sent',
      },
      {
        id: 'm-3',
        role: 'agent_human',
        authorName: 'Amara · Support',
        body: 'Hi, Amara from Buyer Protection. I\'ve raised a trace with the carrier — if there\'s no scan within 48 hours we refund in full, shipping included. No action needed from you yet.',
        createdAt: '2026-09-26T10:05:00Z',
        status: 'sent',
      },
      {
        id: 'm-4',
        role: 'customer',
        authorName: null,
        body: 'Thanks Amara. The seller also marked it posted a day after the label was bought, if that helps.',
        createdAt: '2026-09-26T11:02:00Z',
        status: 'sent',
      },
    ],
    events: [
      { kind: 'opened', label: 'Case opened', detail: 'Order issue · ord-1042', at: '2026-09-26T08:12:00Z' },
      { kind: 'in_review', label: 'In review', detail: 'Assigned to Buyer Protection', at: '2026-09-26T08:40:00Z' },
      { kind: 'note', label: 'Carrier trace raised', at: '2026-09-26T10:15:00Z' },
    ],
    resolution: null,
    csat: null,
    createdAt: '2026-09-26T08:12:00Z',
    updatedAt: '2026-09-26T11:02:00Z',
  },
  {
    id: 'tv-47911',
    ref: 'TV-47911',
    conversationId: null,
    topicId: 'refund',
    topicLabel: 'Refund',
    orderId: 'ord-1038',
    contextLinks: [{ kind: 'listing', id: 'l19' }],
    // Two photos attached with the return request — the customer message
    // references them ("Photos attached to the return request").
    evidence: (listingById('l19')?.images ?? [])
      .slice(0, 2)
      .map((uri, i) => ({ id: `ev-47911-${i + 1}`, uri })),
    status: 'resolved',
    priority: 'normal',
    messages: [
      {
        id: 'm-1',
        role: 'customer',
        authorName: null,
        body: 'The blazer arrived with a torn lining and a pull across the back seam — nothing in the listing mentioned damage. Photos attached to the return request.',
        createdAt: '2026-09-20T18:40:00Z',
        status: 'sent',
      },
      {
        id: 'm-2',
        role: 'agent_human',
        authorName: 'Jonah · Resolutions',
        body: 'Thanks for the photos — the lining tear is clearly not wear. I\'ve approved the refund and arranged a free return label. Keep the item until the label is scanned.',
        createdAt: '2026-09-22T10:05:00Z',
        status: 'sent',
      },
    ],
    events: [
      { kind: 'opened', label: 'Case opened', at: '2026-09-20T18:40:00Z' },
      { kind: 'evidence', label: 'Evidence received', detail: '2 photos attached', at: '2026-09-20T18:41:00Z' },
      { kind: 'in_review', label: 'In review', detail: 'Assigned to Resolutions', at: '2026-09-21T09:00:00Z' },
      { kind: 'resolved', label: 'Resolved', detail: 'Refund approved', at: '2026-09-22T10:05:00Z' },
    ],
    resolution: {
      disposition: 'Refund approved',
      note: '£89.90 refunded to your original payment method — it lands in 3–5 working days. The return label is in your email; drop the parcel within 5 working days.',
    },
    csat: null,
    createdAt: '2026-09-20T18:40:00Z',
    updatedAt: '2026-09-22T10:05:00Z',
  },
  {
    // Long AI-handled thread on the delivery-failed order — exercises the
    // message pagination and the "Talk to a person" handoff (no human has
    // replied yet, so the assistant still owns the conversation).
    id: 'tv-47680',
    ref: 'TV-47680',
    conversationId: null,
    topicId: 'order_issue',
    topicLabel: 'Order issue',
    orderId: 'ord-1053',
    contextLinks: [{ kind: 'listing', id: 'l15' }],
    status: 'open',
    priority: 'normal',
    messages: thread('t47680', '2026-09-25T09:02:00Z', 95, [
      ['customer', 'Order ord-1053 shows "delivery failed" but I was home all day — no card was left either.', null],
      ['agent_ai', 'Sorry about that. I can see the carrier recorded a failed attempt at 14:30 with "no access to the building" as the reason.', 'ThryftVerse Assistant'],
      ['customer', 'There\'s a concierge at my building — they always take parcels. Can you check what address the driver went to?', null],
      ['agent_ai', 'The delivery GPS ping places the driver at the correct postcode. Sometimes the access note is logged by default when a signature can\'t be obtained.', 'ThryftVerse Assistant'],
      ['customer', 'So what happens now? Do they try again?', null],
      ['agent_ai', 'The carrier will usually re-attempt on the next working day. I\'ve flagged the parcel for redelivery and added a note that a concierge is available.', 'ThryftVerse Assistant'],
      ['customer', 'The tracking hasn\'t moved since the failed attempt though.', null],
      ['agent_ai', 'You\'re right — the last scan is still the failed delivery event. If there\'s no new scan by tomorrow morning I\'ll escalate this to a carrier trace.', 'ThryftVerse Assistant'],
      ['system', 'Redelivery requested with the carrier.', null],
      ['customer', 'Morning — still nothing on tracking.', null],
      ['agent_ai', 'I\'ve opened a trace with the carrier now. They have 48 hours to locate the parcel or confirm it as lost.', 'ThryftVerse Assistant'],
      ['customer', 'And if it\'s lost?', null],
      ['agent_ai', 'Then you\'re covered by Buyer Protection — a full refund including postage, no need to chase the carrier yourself.', 'ThryftVerse Assistant'],
      ['customer', 'Ok. The seller hasn\'t replied to my message about this either.', null],
      ['agent_ai', 'I can see the message is unread. Sellers aren\'t required to respond during a carrier trace — the resolution comes through the protection claim.', 'ThryftVerse Assistant'],
      ['customer', 'Understood. How will I know when the trace completes?', null],
      ['agent_ai', 'I\'ll update this thread the moment the carrier responds. You\'ll also get an email.', 'ThryftVerse Assistant'],
      ['customer', 'Thanks. One more thing — the parcel was supposed to be a gift for this weekend.', null],
      ['agent_ai', 'I\'m sorry it won\'t make it in time. If the trace comes back as delivered-to-wrong-address the refund still covers you in full.', 'ThryftVerse Assistant'],
      ['customer', 'Is there any chance it still arrives today?', null],
      ['agent_ai', 'Realistically no — the parcel is still at the national hub per the last confirmed scan. I won\'t promise what tracking doesn\'t show.', 'ThryftVerse Assistant'],
      ['customer', 'Appreciate the honesty. I\'ll wait for the trace.', null],
      ['agent_ai', 'The trace is logged under reference CRT-55621. Nothing needed from you meanwhile.', 'ThryftVerse Assistant'],
      ['system', 'Carrier trace CRT-55621 opened.', null],
      ['customer', 'Hi — checking in, it\'s been a day and a half.', null],
      ['agent_ai', 'The carrier has about 12 hours left on the trace window. Still no new scans, which is common mid-trace.', 'ThryftVerse Assistant'],
      ['customer', 'Ok, thanks for the update.', null],
      ['agent_ai', 'I\'ll post here as soon as the carrier closes the trace — one way or the other you\'ll have an answer by tomorrow.', 'ThryftVerse Assistant'],
    ]),
    events: [
      { kind: 'opened', label: 'Case opened', detail: 'Order issue · ord-1053', at: '2026-09-25T09:02:00Z' },
      { kind: 'note', label: 'Redelivery requested', at: '2026-09-25T20:30:00Z' },
      { kind: 'note', label: 'Carrier trace opened', detail: 'Reference CRT-55621', at: '2026-09-26T08:50:00Z' },
    ],
    resolution: null,
    csat: null,
    createdAt: '2026-09-25T09:02:00Z',
    updatedAt: '2026-09-27T10:15:00Z',
  },
  {
    id: 'tv-48150',
    ref: 'TV-48150',
    conversationId: null,
    topicId: 'verification',
    topicLabel: 'Verification',
    orderId: null,
    status: 'open',
    priority: 'normal',
    messages: [
      {
        id: 'm-1',
        role: 'customer',
        authorName: null,
        body: 'I\'ve uploaded my ID and a utility bill for seller verification — submitting here in case the upload didn\'t come through.',
        createdAt: '2026-09-23T12:20:00Z',
        status: 'sent',
      },
      {
        id: 'm-2',
        role: 'system',
        authorName: null,
        body: 'Documents received. Our trust team reviews within 48 hours and emails the outcome.',
        createdAt: '2026-09-23T12:21:00Z',
        status: 'sent',
      },
    ],
    events: [{ kind: 'opened', label: 'Case opened', at: '2026-09-23T12:20:00Z' }],
    resolution: null,
    csat: null,
    createdAt: '2026-09-23T12:20:00Z',
    updatedAt: '2026-09-23T12:21:00Z',
  },
  {
    id: 'tv-45120',
    ref: 'TV-45120',
    conversationId: null,
    topicId: 'payments',
    topicLabel: 'Payments & payouts',
    orderId: null,
    // The withdrawal the case is about — payout detail lives in Wallet.
    contextLinks: [{ kind: 'payout', id: 'TVP-88231' }],
    status: 'closed',
    priority: 'low',
    messages: [
      {
        id: 'm-1',
        role: 'customer',
        authorName: null,
        body: 'My withdrawal from the 17th still isn\'t showing in my bank.',
        createdAt: '2026-09-18T08:05:00Z',
        status: 'sent',
      },
      {
        id: 'm-2',
        role: 'agent_human',
        authorName: 'Priya · Payments',
        body: 'The payout left on 17 Sep and your bank posted it on 18 Sep — the reference starts TVP. If it\'s still not visible, send the last four digits of your account and I\'ll raise a trace.',
        createdAt: '2026-09-18T10:00:00Z',
        status: 'sent',
      },
    ],
    events: [
      { kind: 'opened', label: 'Case opened', at: '2026-09-18T08:02:00Z' },
      { kind: 'in_review', label: 'In review', detail: 'Assigned to Payments', at: '2026-09-18T08:30:00Z' },
      { kind: 'resolved', label: 'Resolved', detail: 'Information provided', at: '2026-09-18T10:12:00Z' },
      { kind: 'closed', label: 'Case closed', at: '2026-09-19T09:00:00Z' },
    ],
    resolution: {
      disposition: 'Information provided',
      note: 'Payout confirmed settled with the bank on 18 Sep.',
    },
    csat: { rating: 'helpful', note: 'Sorted in one reply.' },
    createdAt: '2026-09-18T08:02:00Z',
    updatedAt: '2026-09-19T09:00:00Z',
  },
];

/** Popular articles for the hub — drawn from the help-centre FAQ copy. */
export interface SupportArticle {
  id: string;
  q: string;
  a: string;
}

export const POPULAR_ARTICLES: SupportArticle[] = [
  {
    id: 'buyer-protection',
    q: 'How does Buyer Protection work?',
    a: 'Every purchase made through ThryftVerse checkout is covered automatically. Your payment is held until the item arrives as described. If it never shows up, arrives damaged, or is significantly different from the listing, report it within 2 days of delivery and we\'ll refund you in full — including shipping.',
  },
  {
    id: 'when-paid',
    q: 'When do I get paid for a sale?',
    a: 'Funds become available in your wallet once the order is marked delivered. If the buyer doesn\'t confirm, delivery is confirmed automatically from the carrier\'s tracking event. You can then withdraw to your bank — payouts land in 1–2 working days.',
  },
  {
    id: 'returns',
    q: 'How do returns work?',
    a: 'All sales are final unless the item is not as described — wrong item, undisclosed damage, or a counterfeit. If that happens, open a case from the order within 2 days of delivery and keep the item in the condition it arrived. We\'ll arrange the return label and refund.',
  },
  {
    id: 'withdraw',
    q: 'How do I withdraw my balance?',
    a: 'Open Wallet, tap Withdraw, and confirm your payout method. There\'s no fee and no minimum — your full available balance goes to your default card or bank account.',
  },
  {
    id: 'contact-seller',
    q: 'How do I contact a seller?',
    a: 'Every listing has a Message button — chats land in your Inbox. For order issues use the Help button on the order itself so our team can see the full context.',
  },
];
