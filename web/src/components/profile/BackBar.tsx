'use client';

/**
 * BackBar — transparent 44px back target + trailing quiet actions.
 * Used by board/collection detail surfaces that sit below the global header.
 */

import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/ui/IconButton';

export function BackBar({ actions }: { actions?: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between px-2 pt-1 sm:px-4">
      <IconButton name="back" aria-label="Back" onClick={() => router.back()} />
      {actions ? <div className="flex items-center">{actions}</div> : null}
    </div>
  );
}
