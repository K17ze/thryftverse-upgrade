'use client';

export const FIELD_LABEL = 'text-label text-text-secondary';
export const INPUT =
  'h-12 w-full rounded-lg border border-border bg-input px-4 text-body text-input-text outline-none placeholder:text-text-muted focus:border-text-muted';

export function CreateStreamSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pt-6 sm:px-6" aria-busy aria-label="Loading go live">
      <div className="skeleton h-7 w-40 rounded-md" />
      <div className="skeleton mt-6 aspect-[16/10] w-full rounded-lg" />
      <div className="skeleton mt-6 h-12 w-full rounded-lg" />
      <div className="skeleton mt-6 h-24 w-full rounded-lg" />
    </div>
  );
}
