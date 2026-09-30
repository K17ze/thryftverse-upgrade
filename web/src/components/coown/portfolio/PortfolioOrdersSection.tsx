'use client';

import type { CoOwnOrder } from '@/lib/contracts/coown';
import { OpenOrders, OrderHistory } from '../OpenOrders';
import { PortfolioSectionState } from './PortfolioSectionState';

interface PortfolioOrdersSectionProps {
  openOrders: CoOwnOrder[];
  terminalOrders: CoOwnOrder[];
  titleFor: (assetId: string) => string;
  onCancelOrder: (id: string) => Promise<void>;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
}

export function PortfolioOrdersSection({
  openOrders,
  terminalOrders,
  titleFor,
  onCancelOrder,
  isError,
  isLoading,
  onRetry,
}: PortfolioOrdersSectionProps) {
  return (
    <>
      {isError ? (
        <section className="mt-10" aria-label="Orders">
          <PortfolioSectionState
            loading={isLoading}
            error
            onRetry={onRetry}
            hasRows={openOrders.length + terminalOrders.length > 0}
          />
        </section>
      ) : null}

      {openOrders.length > 0 ? (
        <section className="mt-10">
          <OpenOrders
            orders={openOrders}
            assetTitle={titleFor}
            onCancel={onCancelOrder}
          />
        </section>
      ) : null}

      {terminalOrders.length > 0 ? (
        <section className="mt-10">
          <OrderHistory orders={terminalOrders} assetTitle={titleFor} />
        </section>
      ) : null}
    </>
  );
}
