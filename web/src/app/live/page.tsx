'use client';

import Link from 'next/link';
import { LiveView } from '@/components/live/LiveView';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/lib/session/SessionProvider';

export default function LivePage() {
  const { isGuest } = useSession();
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pt-5 sm:px-6 md:pt-7">
      <h1 className="sr-only">Live shopping</h1>
      {!isGuest ? (
        <div className="mb-4 flex justify-end">
          <Link
            href="/live/create"
            className="pressable inline-flex h-9 items-center gap-1.5 rounded-md bg-surface-alt px-3.5 text-caption font-semibold text-text-primary hover:bg-surface-raised"
          >
            <Icon name="videocam" size={16} />
            Go live
          </Link>
        </div>
      ) : null}
      <LiveView />
    </div>
  );
}
