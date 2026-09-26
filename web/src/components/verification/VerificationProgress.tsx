'use client';

/**
 * VerificationProgress — staged step indicator for the KYC flow.
 * Same grammar as SellProgress: numbered dots, hairline connectors, a check
 * on completed steps — but switches steps rather than scrolling. Completed
 * steps are tappable so review "Edit" links can jump back.
 */

import { Icon } from '@/components/ui/Icon';
import type { VerificationStep } from './verificationModel';

const FLOW_STEPS: { id: VerificationStep; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'document', label: 'Document' },
  { id: 'review', label: 'Review' },
];

interface VerificationProgressProps {
  current: VerificationStep;
  onSelect: (step: VerificationStep) => void;
}

export function VerificationProgress({ current, onSelect }: VerificationProgressProps) {
  const currentIndex = Math.max(
    FLOW_STEPS.findIndex((s) => s.id === current),
    0,
  );

  return (
    <nav aria-label="Verification progress" className="pb-8">
      <ol className="flex items-center">
        {FLOW_STEPS.map((step, i) => {
          const done = i < currentIndex;
          const isCurrent = i === currentIndex;
          const reachable = done;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => reachable && onSelect(step.id)}
                disabled={!reachable}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex min-w-0 items-center gap-2 ${reachable ? 'pressable' : 'cursor-default'}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-micro font-semibold ${
                    done
                      ? 'bg-success-subtle text-success-text'
                      : isCurrent
                        ? 'bg-brand text-text-inverse'
                        : 'border border-border text-text-muted'
                  }`}
                >
                  {done ? <Icon name="check" size={12} /> : i + 1}
                </span>
                <span
                  className={`hidden text-caption font-medium sm:block ${
                    isCurrent
                      ? 'text-text-primary'
                      : done
                        ? 'text-text-secondary'
                        : 'text-text-muted'
                  }`}
                >
                  {step.label}
                </span>
              </button>
              {i < FLOW_STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={`mx-3 h-px flex-1 ${done ? 'bg-border' : 'bg-border-subtle'}`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
