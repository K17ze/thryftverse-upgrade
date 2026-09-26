'use client';

/**
 * Help centre — search-first FAQ surface. Flat rows, chevron disclosure,
 * hairline rhythm. Answers are real copy, not filler.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: 'How does Buyer Protection work?',
    a: 'Every purchase made through ThryftVerse checkout is covered automatically. Your payment is held until the item arrives as described. If it never shows up, arrives damaged, or is significantly different from the listing, report it within 2 days of delivery and we\'ll refund you in full — including shipping.',
  },
  {
    q: 'When do I get paid for a sale?',
    a: 'Funds become available in your wallet once the order is marked delivered. If the buyer doesn\'t confirm, delivery is confirmed automatically from the carrier\'s tracking event. You can then withdraw to your bank — payouts land in 1–2 working days.',
  },
  {
    q: 'How do I withdraw my balance?',
    a: 'Open Wallet, tap Withdraw, and confirm your payout method. There\'s no fee and no minimum — your full available balance goes to your default card or bank account.',
  },
  {
    q: 'What can I sell on ThryftVerse?',
    a: 'Pre-loved clothing, shoes, bags and accessories in honest, sellable condition. Counterfeits, replicas and items that violate our authenticity policy are removed and can lead to account restrictions. When in doubt, list it — our review catches problems before buyers do.',
  },
  {
    q: 'How do returns work?',
    a: 'All sales are final unless the item is not as described — wrong item, undisclosed damage, or a counterfeit. If that happens, open a case from the order within 2 days of delivery and keep the item in the condition it arrived. We\'ll arrange the return label and refund.',
  },
  {
    q: 'How is shipping handled?',
    a: 'The buyer pays shipping at checkout. When you sell, we email a prepaid tracked label — print it, drop the parcel within 5 working days, and tracking updates the order automatically for both sides.',
  },
  {
    q: 'What does the sustainability grade mean?',
    a: 'Grades A–D estimate the footprint avoided by buying the piece second-hand instead of new, based on material, weight and category. Grade A items — wool coats, denim, leather — avoid the most. It\'s guidance, not a guarantee, and it\'s free on every listing.',
  },
  {
    q: 'How do I contact a seller?',
    a: 'Every listing has a Message button — chats land in your Inbox. For order issues use the Help button on the order itself so our team can see the full context.',
  },
];

function FaqRow({ faq, open, onToggle }: { faq: Faq; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border-subtle">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="pressable flex min-h-[56px] w-full items-center gap-3 py-3.5 text-left"
      >
        <span className="flex-1 text-body-emphasis font-medium text-text-primary">{faq.q}</span>
        <Icon
          name="chevronDown"
          size={18}
          className={`shrink-0 text-text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <p className="pb-5 pr-8 text-body leading-relaxed text-text-secondary">{faq.a}</p>
      ) : null}
    </div>
  );
}

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter(
      (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <h1 className="text-screen-title font-semibold text-text-primary">Help centre</h1>
      <p className="mt-2 text-body-large text-text-secondary">
        Answers to the things people ask most.
      </p>

      {/* Search */}
      <label className="relative mt-6 block" role="search">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
          <Icon name="search" size={18} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help"
          aria-label="Search help articles"
          className="h-11 w-full rounded-full border border-transparent bg-surface-alt pl-10 pr-4 text-body text-input-text placeholder:text-text-muted focus:border-border focus:bg-surface-raised focus:outline-none"
        />
      </label>

      {/* FAQ */}
      <div className="mt-6">
        {faqs.length > 0 ? (
          <div className="border-t border-border-subtle">
            {faqs.map((f, i) => (
              <FaqRow
                key={f.q}
                faq={f}
                open={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            icon="search"
            title="No matching articles"
            subtitle="Try different keywords, or reach out below."
          />
        )}
      </div>

      {/* Contact */}
      <div className="mt-10 flex items-center justify-between gap-4 border-t border-border-subtle pt-6">
        <div>
          <p className="text-body-emphasis font-medium text-text-primary">Still need help?</p>
          <p className="mt-0.5 text-body text-text-secondary">
            Open a case — we answer within one working day.
          </p>
        </div>
        <Link
          href="/support"
          className="pressable inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-surface-alt px-4 text-body font-semibold text-text-primary hover:bg-surface-raised"
        >
          <Icon name="chat" size={16} />
          Contact support
        </Link>
      </div>
    </div>
  );
}
