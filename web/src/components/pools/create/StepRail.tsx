'use client';

import { Icon } from '@/components/ui/Icon';

export type CreatePoolStep = 'asset' | 'rules';

const STEPS: { key: CreatePoolStep; n: string; label: string }[] = [
  { key: 'asset', n: '01', label: 'Target' },
  { key: 'rules', n: '02', label: 'Rules' },
];

/** Two-step rail — done steps collapse to a check, the active step leads. */
export function StepRail({ step }: { step: CreatePoolStep }) {
  const activeIndex = step === 'asset' ? 0 : 1;
  return (
    <ol className="flex items-center gap-3" aria-label="Wizard progress">
      {STEPS.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={s.key} className="flex items-center gap-3">
            {i > 0 ? (
              <span aria-hidden="true" className="h-px w-8 bg-border-subtle" />
            ) : null}
            <span
              className="flex items-center gap-1.5"
              aria-current={active ? 'step' : undefined}
            >
              {done ? (
                <Icon name="check" size={13} className="text-coown-up" />
              ) : (
                <span
                  className={`tnum text-micro font-semibold ${
                    active ? 'text-brand' : 'text-text-muted'
                  }`}
                >
                  {s.n}
                </span>
              )}
              <span
                className={`text-meta font-semibold uppercase tracking-wide ${
                  active ? 'text-text-primary' : 'text-text-muted'
                }`}
              >
                {s.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
