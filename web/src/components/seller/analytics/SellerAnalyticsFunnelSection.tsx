import React from 'react';
import type { SellerAnalyticsView } from '@/lib/hooks/seller-queries';
import {
  calculateStepPct,
  FunnelRow,
  SectionTitle,
} from './SellerAnalyticsPrimitives';

export function SellerAnalyticsFunnelSection({
  data,
  funnelBase,
}: {
  data: SellerAnalyticsView;
  funnelBase: number | null;
}) {
  return (
    <section className="mt-10 lg:mt-0" aria-labelledby="analytics-funnel">
      <SectionTitle>Demand funnel</SectionTitle>
      {funnelBase ? (
        <ul className="mt-4 space-y-3">
          <FunnelRow
            label="Views"
            value={data.viewsTotal}
            widthPct={100}
            stepPct={null}
          />
          <FunnelRow
            label="Likes"
            value={data.likesTotal}
            widthPct={(data.likesTotal / funnelBase) * 100}
            stepPct={calculateStepPct(data.likesTotal, data.viewsTotal)}
          />
          <FunnelRow
            label="Offers received"
            value={data.offersReceived}
            widthPct={
              data.offersReceived != null
                ? (data.offersReceived / funnelBase) * 100
                : 0
            }
            stepPct={calculateStepPct(data.offersReceived, data.likesTotal)}
          />
          <FunnelRow
            label="Orders"
            value={data.ordersTotal}
            widthPct={(data.ordersTotal / funnelBase) * 100}
            stepPct={calculateStepPct(
              data.ordersTotal,
              data.offersReceived ?? data.likesTotal,
            )}
          />
        </ul>
      ) : (
        <p className="mt-3 text-body text-text-muted">
          No views in this range — the funnel fills in once buyers see your items.
        </p>
      )}
    </section>
  );
}
