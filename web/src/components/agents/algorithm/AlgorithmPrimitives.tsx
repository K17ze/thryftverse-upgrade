'use client';

import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/ui/IconButton';
import type { TopicWeight } from '../useAlgorithmPrefs';

export const SUGGESTED_TOPICS = [
  'Vintage denim',
  'Sneakers',
  'Streetwear',
  'Minimalist style',
  'Tailored outerwear',
  'Vintage watches',
  'Workwear',
  'Leather goods',
  'Knitwear',
  'Archive fashion',
  'Knit vests',
  'Sustainability',
] as const;

export const SUGGESTED_BRANDS = [
  'Carhartt WIP',
  'Barbour',
  'Levi\u2019s',
  'Patagonia',
  'Ralph Lauren',
  'Nike',
  'Dr. Martens',
  'Stone Island',
] as const;

export const WEIGHTS: Array<{ value: TopicWeight; label: string }> = [
  { value: 'low', label: 'Less' },
  { value: 'medium', label: 'Usual' },
  { value: 'high', label: 'More' },
];

/** Less / Usual / More — the weight grammar, inline on the row. */
export function WeightControl({
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: TopicWeight;
  onChange: (w: TopicWeight) => void;
  'aria-label': string;
}) {
  return (
    <div
      className="flex shrink-0 items-center rounded-full border border-border-subtle"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {WEIGHTS.map((w) => {
        const selected = w.value === value;
        return (
          <button
            key={w.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(w.value)}
            className={`pressable h-8 rounded-full px-3 text-meta font-medium ${
              selected ? 'bg-brand text-text-inverse' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {w.label}
          </button>
        );
      })}
    </div>
  );
}

export function PageHeader({ subtitle }: { subtitle?: string }) {
  const router = useRouter();
  return (
    <>
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to agents" onClick={() => router.push('/agents')} />
        <h1 className="flex-1 text-screen-title text-text-primary">
          Your algorithm
        </h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        The signals that shape your home feed and Discover.{subtitle ? ` ${subtitle}` : ''}
      </p>
    </>
  );
}

/** Wire band → row weight. 'more' → high, 'usual' → medium, 'less' and
 *  'excluded' → low (the row grammar has no exclude option — 'excluded'
 *  displays as its nearest honest neighbour rather than as 'usual'). */
export function bandToWeight(band: string): TopicWeight {
  if (band === 'more') return 'high';
  if (band === 'less' || band === 'excluded') return 'low';
  return 'medium';
}

export function weightToDirection(weight: TopicWeight): 'more' | 'usual' | 'less' {
  if (weight === 'high') return 'more';
  if (weight === 'low') return 'less';
  return 'usual';
}
