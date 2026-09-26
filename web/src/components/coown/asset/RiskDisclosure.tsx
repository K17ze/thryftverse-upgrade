import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/** Risk disclosure — one quiet band, hairline-separated, no drama. */
export function RiskDisclosure() {
  return (
    <section
      aria-label="Risk disclosure"
      className="mt-14 border-t border-border-subtle py-6"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-muted">
        <Icon name="shield" size={14} className="shrink-0" />
        <span>
          Capital at risk. Fractional ownership is not a regulated investment.
        </span>
        <Link
          href="/buyer-protection"
          className="font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          Buyer protection
        </Link>
      </p>
    </section>
  );
}
