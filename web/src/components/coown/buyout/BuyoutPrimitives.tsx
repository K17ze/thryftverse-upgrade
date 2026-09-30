'use client';

export const FIELD =
  'h-11 w-full rounded-md border border-border bg-input px-3.5 text-body tnum text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none';

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between py-2.5 ${
        last ? '' : 'border-b border-border-subtle'
      }`}
    >
      <span className="text-body text-text-secondary">{label}</span>
      <span className="text-body font-semibold text-text-primary tnum">{value}</span>
    </div>
  );
}

export function BuyoutSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
      <div className="skeleton h-4 w-24 rounded-sm" aria-hidden="true" />
      <div className="mt-4 skeleton h-9 w-48 rounded-sm" aria-hidden="true" />
      <div className="mt-8 space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-16 lg:space-y-0" aria-hidden="true">
        <div className="space-y-3 lg:order-1">
          <div className="skeleton h-28 rounded-lg" />
          <div className="skeleton h-40 rounded-lg" />
        </div>
        <div className="lg:order-2">
          <div className="skeleton h-16 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
