'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatConfirmed } from './useCreateStreamWorkflow';

interface CreateStreamConfirmedViewProps {
  confirmed: { iso: string; streamId: string };
  isLive: boolean;
}

export function CreateStreamConfirmedView({
  confirmed,
  isLive,
}: CreateStreamConfirmedViewProps) {
  const router = useRouter();

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-success-text">
        <Icon name="check" filled size={28} />
      </span>
      <h1 className="mt-5 text-screen-title text-text-primary">Show scheduled</h1>
      <p className="mt-2 text-body text-text-secondary">
        {isLive
          ? `${formatConfirmed(confirmed.iso)} — it’s in Coming up on web and mobile. The host console opens when it’s time.`
          : `${formatConfirmed(confirmed.iso)} — your show appears under Coming up.`}
      </p>
      <div className="mt-7 flex w-full flex-col gap-2">
        <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/live')}>
          Done
        </Button>
        <Button
          variant="quiet"
          size="md"
          fullWidth
          onClick={() => router.push(`/live/host/${confirmed.streamId}`)}
        >
          Manage show
        </Button>
      </div>
    </div>
  );
}
