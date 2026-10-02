import { WalletSkeleton } from '@/components/wallet/hub/WalletSkeleton';

/** Streaming skeleton for the wallet segment — balance column left,
 *  activity ledger right, matching the hub's own loading frame. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl pb-16 lg:max-w-[1440px]">
      <WalletSkeleton />
    </div>
  );
}
