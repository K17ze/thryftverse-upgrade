import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

const STEPS = [
  {
    icon: 'layers',
    title: 'Buy units',
    copy: 'Claim a fraction of a verified, vaulted asset — units from around £54.',
  },
  {
    icon: 'payout',
    title: 'Earn distributions',
    copy: 'Rental, resale and licensing income is paid per unit, straight to your wallet.',
  },
  {
    icon: 'people',
    title: 'Exit by vote or sale',
    copy: 'Holders vote on exits together, or sell units on the market at any time.',
  },
] as const;

/** Education band — three quiet steps, one honest risk line. */
export function EducationBand() {
  return (
    <section aria-labelledby="how-coown-works" className="mt-14 border-t border-border-subtle pt-8">
      <h2 id="how-coown-works" className="text-editorial-title text-text-primary">
        How Co-Own works
      </h2>
      <ol className="mt-6 grid gap-8 sm:grid-cols-3 sm:gap-6">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <div className="flex items-center gap-2.5">
              <Icon name={step.icon} size={20} className="text-antique-gold" />
              <span className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
            <h3 className="mt-2.5 text-body-emphasis font-semibold text-text-primary">{step.title}</h3>
            <p className="mt-1.5 max-w-xs text-body text-text-secondary">{step.copy}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-subtle pt-4 text-meta text-text-muted">
        <Icon name="warning" size={13} className="shrink-0 text-warning-text" />
        <span>Capital at risk. Unit prices can fall as well as rise, and exits depend on holder votes.</span>
        <Link
          href="/help"
          className="font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          Risk disclosure
        </Link>
      </p>
    </section>
  );
}
