/**
 * Support fixtures — resolution-centre seed data for the web support hub.
 * Four cases covering the canonical shapes: an in-review order issue, a
 * resolved refund awaiting acceptance, an open verification case, and a
 * closed case with submitted CSAT. Dates live in the fixture world (Sep 2026)
 * and are deterministic so SSR and client render identically.
 */

import type { SupportTicket } from '@/lib/contracts/support';

export const SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: 'tv-48213',
    ref: 'TV-48213',
    topicId: 'order_issue',
    topicLabel: 'Order issue',
    orderRef: 'ord-1042',
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
    topicId: 'refund',
    topicLabel: 'Refund',
    orderRef: 'ord-1038',
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
    id: 'tv-48150',
    ref: 'TV-48150',
    topicId: 'verification',
    topicLabel: 'Verification',
    orderRef: null,
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
    topicId: 'payments',
    topicLabel: 'Payments & payouts',
    orderRef: null,
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
    csat: { rating: 5, note: 'Sorted in one reply.' },
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
