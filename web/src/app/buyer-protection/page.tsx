import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type AppIconName } from '@/components/ui/Icon';

export const metadata: Metadata = {
  title: 'Buyer Protection',
  description: 'Every ThryftVerse order is covered — payment held until it arrives as described.',
};

const STEPS: { icon: AppIconName; title: string; body: string }[] = [
  {
    icon: 'card',
    title: 'Pay through checkout',
    body: 'Your payment is held by ThryftVerse — it never goes straight to the seller.',
  },
  {
    icon: 'box',
    title: 'The seller ships',
    body: 'They get a prepaid tracked label and 5 working days to dispatch. You watch it move.',
  },
  {
    icon: 'shieldCheck',
    title: 'It arrives — or we refund',
    body: 'Funds release only on confirmed delivery. Not as described? Report it within 2 days and get every penny back.',
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      <div className="mt-3 space-y-4 text-body leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export default function BuyerProtectionPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <h1 className="text-display font-bold tracking-tight text-text-primary">
        Buyer Protection
      </h1>
      <p className="mt-4 text-body-large leading-relaxed text-text-secondary">
        Buying pre-loved should feel as safe as buying new. Every order paid
        through ThryftVerse is covered — automatically, on every item, at no
        extra step for you.
      </p>

      {/* How it works — flat steps, hairline separators */}
      <div className="mt-10 divide-y divide-border-subtle border-y border-border-subtle">
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex gap-4 py-5">
            <span className="tnum flex h-8 w-8 shrink-0 items-center justify-center text-item-title font-bold text-text-muted">
              {i + 1}
            </span>
            <div>
              <p className="flex items-center gap-2 text-body-emphasis font-semibold text-text-primary">
                <Icon name={s.icon} size={17} className="text-text-secondary" />
                {s.title}
              </p>
              <p className="mt-1.5 text-body leading-relaxed text-text-secondary">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <Section title="What's covered">
        <p>
          Full refund — item price, protection fee and shipping — when the
          item never arrives, arrives damaged in transit, is materially
          different from the listing (wrong item, wrong size, undisclosed
          flaws), or turns out to be counterfeit.
        </p>
      </Section>

      <Section title="What's not covered">
        <p>
          Change of mind and fit — listings show measurements, so check them
          before you buy. Payments arranged outside checkout (bank transfers,
          cash, other apps) are invisible to us and can’t be protected.
        </p>
      </Section>

      <Section title="How to make a claim">
        <p>
          Open the order, tap “Report a problem” within 2 days of the
          delivery scan, and add photos. Keep the item exactly as it arrived.
          Most claims resolve within 3 working days; if a return is needed we
          supply the label.
        </p>
      </Section>

      <p className="mt-12 border-t border-border-subtle pt-6 text-body text-text-secondary">
        Questions about a specific order?{' '}
        <Link
          href="/help"
          className="font-medium text-text-primary underline decoration-border underline-offset-4 hover:decoration-text-muted"
        >
          Visit the help centre
        </Link>
        .
      </p>
    </div>
  );
}
