'use client';

import { WalletView } from '@/components/wallet/WalletView';

export default function WalletPage() {
  return (
    <div className="mx-auto w-full max-w-3xl pb-16">
      <h1 className="sr-only">Wallet</h1>
      <WalletView />
    </div>
  );
}
