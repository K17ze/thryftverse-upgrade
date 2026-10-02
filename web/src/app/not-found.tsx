import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <Icon name="compass" size={36} className="mb-4 text-text-muted" />
      <h1 className="text-section-title font-semibold text-text-primary">This page doesn&apos;t exist</h1>
      <p className="mt-1.5 max-w-sm text-body text-text-secondary">
        The link may be broken, or the page may have been moved.
      </p>
      <Link
        href="/"
        className="pressable mt-5 inline-flex h-10 items-center justify-center rounded-md border border-border px-5 text-body font-medium text-text-primary"
      >
        Back to Home
      </Link>
    </div>
  );
}
