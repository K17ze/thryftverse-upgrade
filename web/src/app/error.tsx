'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-text-muted">
        <Icon name="warning" size={28} />
      </div>
      <h1 className="text-section-title font-semibold text-text-primary">Something went wrong</h1>
      <p className="mt-1.5 max-w-sm text-body text-text-secondary">
        An unexpected error occurred. You can try again — if it keeps happening, let us know.
      </p>
      <Button variant="secondary" className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
