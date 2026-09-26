'use client';

/**
 * PdpMarket — "Price history & market" evidence section.
 * Port of the mobile ItemDetailPriceMarket: one honest ledger (price drop,
 * previous price, similar-sold range, time on market) plus the "Similar
 * sold items" strip — the eBay sold-comps signal that anchors pricing
 * trust. Every row derives from the fixture record or the sold-comps
 * dataset; nothing is invented. Self-omits when no row and no comp can
 * render.
 */

import type { Listing } from '@/lib/contracts/domain';
import { priceHistoryFor, soldComparablesFor } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { formatPrice } from '@/lib/utils/format';

interface PdpMarketProps {
  listing: Listing;
}

function soldDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface InsightRow {
  label: string;
  value: string;
  muted?: boolean;
  success?: boolean;
}

export function PdpMarket({ listing }: PdpMarketProps) {
  const priceEvents = priceHistoryFor(listing);
  const comps = soldComparablesFor(listing);

  // ── Insight rows — mirror mobile buildItemDetailDerived: only truthful
  //    facts, muted for the secondary evidence. ──
  const daysListed = listing.createdAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(listing.createdAt).getTime()) / 86_400_000,
        ),
      )
    : null;
  const showComps = comps.length >= 2;
  const showDays = daysListed != null && daysListed >= 3;

  const rows: InsightRow[] = [];
  const latestEvent = priceEvents[0];
  if (latestEvent) {
    const dropPercent = Math.round(
      ((latestEvent.previousPrice - latestEvent.newPrice) / latestEvent.previousPrice) * 100,
    );
    rows.push(
      { label: 'Listed at', value: formatPrice(latestEvent.previousPrice), muted: true },
      {
        label: 'Reduced',
        value: `once · −${dropPercent}%`,
        success: true,
      },
    );
  } else {
    rows.push({
      label: 'Price history',
      value: 'No reductions recorded',
      muted: true,
    });
  }
  if (showComps) {
    const prices = comps.map((c) => c.soldPrice);
    rows.push({
      label: `${comps.length} similar sold`,
      value: `${formatPrice(Math.min(...prices))}–${formatPrice(Math.max(...prices))}`,
      muted: true,
    });
  }
  if (showDays) {
    rows.push({
      label: 'Time on market',
      value: daysListed === 1 ? '1 day' : `${daysListed} days`,
      muted: true,
    });
  }

  // No evidence at all → the section self-omits rather than publishing a
  // lone "nothing happened" row (mobile hides the whole block likewise).
  if (!latestEvent && !showComps && !showDays) return null;

  return (
    <section className="border-t border-border-subtle py-6" aria-labelledby="pdp-market">
      <h2 id="pdp-market" className="mb-3 text-section-title font-semibold text-text-primary">
        Price history &amp; market
      </h2>

      <dl>
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2.5 last:border-0"
          >
            <dt className="text-body text-text-secondary">{row.label}</dt>
            <dd
              className={`tnum text-right text-body font-medium ${
                row.success
                  ? 'text-success-text'
                  : row.muted
                    ? 'text-text-secondary'
                    : 'text-text-primary'
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {showComps ? (
        <div className="mt-5">
          <h3 className="mb-3 text-label font-semibold uppercase tracking-wide text-text-secondary">
            Similar sold items
          </h3>
          <div
            className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
            role="list"
          >
            {comps.map((comp) => {
              const date = soldDate(comp.soldAt);
              return (
                <div key={comp.id} role="listitem" className="w-[130px] shrink-0 sm:w-[150px]">
                  <div className="relative">
                    <AppImage
                      src={comp.image}
                      alt={comp.title}
                      aspectRatio={0.8}
                      sizes="150px"
                      className="w-full rounded-lg"
                    />
                    <span className="absolute left-1.5 top-1.5 rounded bg-overlay px-1.5 py-0.5 text-meta font-semibold uppercase tracking-wide text-scrim-text-primary">
                      Sold
                    </span>
                  </div>
                  <p className="clamp-1 mt-1.5 text-caption text-text-secondary">
                    {comp.brand ? `${comp.brand} — ` : ''}
                    {comp.title}
                  </p>
                  <p className="mt-0.5 text-caption">
                    <span className="tnum font-semibold text-text-primary">
                      {formatPrice(comp.soldPrice)}
                    </span>
                    {date ? (
                      <span className="text-text-muted"> · {date}</span>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
