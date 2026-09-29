'use client';

/**
 * /co-own/guide — the replayable explainer. Same content as the first-visit
 * CoOwnOnboardingGate (mobile SyndicateOnboardingScreen), rendered as a
 * persistent page so holders can revisit it — the modal is the gate, this
 * is the shelf copy. Ends on the three real entry points: markets, the
 * leaderboard, and the market tape.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';

const SECTIONS: { icon: AppIconName; title: string; body: string }[] = [
  {
    icon: 'layers',
    title: 'Own a piece of something desirable',
    body: 'Co-Own lets you buy units of fashion, luxury, and collectable items. You own a real fraction of the item, not the item itself.',
  },
  {
    icon: 'cart',
    title: 'Buy units at your own pace',
    body: 'Browse available items, see the unit price, and buy as many units as you want. Settlement is in 1ZE — a 1% fee applies.',
  },
  {
    icon: 'repeat',
    title: 'Sell when you are ready',
    body: 'List your units for sale at market price or set a limit. Buyers must match your offer for the trade to fill. Liquidity is not guaranteed.',
  },
  {
    icon: 'shieldCheck',
    title: 'Trust and protection',
    body: 'Issuers are verified sellers. Authenticity, buyer protection, and storage information are shown on each item. Risks are clearly disclosed.',
  },
  {
    icon: 'document',
    title: 'Holders vote on the big decisions',
    body: 'Sale offers, insurance renewals and exits go to a ballot. Your voting power is your units — you can change your vote until the deadline.',
  },
];

export function CoOwnGuideView() {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-20 pt-6 sm:px-6 lg:max-w-[1100px]">
      <div className="flex items-center gap-1">
        <IconButton
          name="back"
          aria-label="Back to Co-Own"
          onClick={() => router.push('/co-own')}
          className="-ml-2"
        />
        <span className="text-meta font-semibold uppercase tracking-wide text-text-muted">
          Guide
        </span>
      </div>

      <header className="mt-6 lg:mt-10 lg:max-w-2xl">
        <span className="rounded-full bg-brand-subtle px-2.5 py-1 text-micro font-semibold uppercase tracking-[0.08em] text-brand">
          Co-Own investing
        </span>
        <h1 className="mt-4 text-editorial-display text-text-primary">How Co-Own works</h1>
        <p className="mt-3 text-body leading-relaxed text-text-secondary">
          Fractional ownership of real collectables — bought, sold and governed
          like a market. Five things to know before your first unit.
        </p>
      </header>

      <ol className="mt-10 space-y-10 lg:mt-14 lg:grid lg:grid-cols-2 lg:gap-x-14 lg:gap-y-0 lg:space-y-0">
        {SECTIONS.map((s, i) => (
          <li key={s.title} className="flex gap-4 lg:border-t lg:border-border-subtle lg:py-7">
            <div className="flex flex-col items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-alt text-brand">
                <Icon name={s.icon} size={20} />
              </span>
              {i < SECTIONS.length - 1 ? (
                <span className="mt-3 w-px flex-1 bg-border-subtle lg:hidden" aria-hidden="true" />
              ) : null}
            </div>
            <div className="pb-2 lg:pb-0">
              <h2 className="text-body-emphasis font-semibold text-text-primary">{s.title}</h2>
              <p className="mt-1.5 text-body leading-relaxed text-text-secondary">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <nav
        aria-label="Start exploring"
        className="mt-12 divide-y divide-border-subtle border-y border-border-subtle lg:mt-16 lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0"
      >
        <Link
          href="/co-own"
          className="group flex items-center justify-between gap-4 py-4 transition-colors hover:bg-row lg:px-5 lg:py-6 lg:first:pl-0 lg:last:pr-0"
        >
          <span>
            <span className="block text-body-emphasis font-semibold text-text-primary">Browse markets</span>
            <span className="mt-0.5 block text-meta text-text-secondary">Every open offering and the secondary book</span>
          </span>
          <Icon name="forward" size={18} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/co-own/leaderboard"
          className="group flex items-center justify-between gap-4 py-4 transition-colors hover:bg-row lg:px-5 lg:py-6 lg:first:pl-0 lg:last:pr-0"
        >
          <span>
            <span className="block text-body-emphasis font-semibold text-text-primary">Leaderboard</span>
            <span className="mt-0.5 block text-meta text-text-secondary">Markets ranked by volume, holders and move</span>
          </span>
          <Icon name="forward" size={18} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/co-own/ledger"
          className="group flex items-center justify-between gap-4 py-4 transition-colors hover:bg-row lg:px-5 lg:py-6 lg:first:pl-0 lg:last:pr-0"
        >
          <span>
            <span className="block text-body-emphasis font-semibold text-text-primary">Market tape</span>
            <span className="mt-0.5 block text-meta text-text-secondary">Every execution across Co-Own, newest first</span>
          </span>
          <Icon name="forward" size={18} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
        </Link>
      </nav>
    </div>
  );
}
