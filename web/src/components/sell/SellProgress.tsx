'use client';

/**
 * SellProgress — stepped section indicator for the top of the sell flow.
 * Completed steps show a check; clicking a step scrolls to its section.
 */

import { Icon } from '@/components/ui/Icon';

export interface SellStep {
  id: string;
  label: string;
  done: boolean;
}

interface SellProgressProps {
  steps: SellStep[];
}

export function SellProgress({ steps }: SellProgressProps) {
  const current = steps.findIndex((s) => !s.done);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav aria-label="Listing progress" className="pb-8">
      <ol className="flex items-center">
        {steps.map((step, i) => {
          const isCurrent = i === current;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => scrollTo(step.id)}
                aria-current={isCurrent ? 'step' : undefined}
                className="pressable flex min-w-0 items-center gap-2"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-micro font-semibold ${
                    step.done
                      ? 'bg-success-subtle text-success-text'
                      : isCurrent
                        ? 'bg-brand text-text-inverse'
                        : 'border border-border text-text-muted'
                  }`}
                >
                  {step.done ? <Icon name="check" size={12} /> : i + 1}
                </span>
                <span
                  className={`hidden text-caption font-medium sm:block ${
                    isCurrent
                      ? 'text-text-primary'
                      : step.done
                        ? 'text-text-secondary'
                        : 'text-text-muted'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={`mx-3 h-px flex-1 ${step.done ? 'bg-border' : 'bg-border-subtle'}`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
