'use client';

/** Issue-studio stepper — a flat index + label row over a hairline.
 *  Completed steps carry a quiet check and step back on click; upcoming
 *  steps stay muted and inert. */

import { Icon } from '@/components/ui/Icon';
import { ISSUE_STEPS, ISSUE_STEP_LABELS, type IssueStep } from './issueDraft';

interface IssueStepperProps {
  current: IssueStep;
  /** Only earlier steps are selectable — forward navigation runs the
   *  per-step validators via the footer, never a skip. */
  onSelect: (step: IssueStep) => void;
  /** False freezes every step — e.g. once the asset is committed the
   *  draft stages are committed context, not editable targets. */
  enabled?: boolean;
}

export function IssueStepper({ current, onSelect, enabled = true }: IssueStepperProps) {
  const currentIdx = ISSUE_STEPS.indexOf(current);
  return (
    <ol
      className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto border-b border-border-subtle px-1 pb-3"
      aria-label="Issuance steps"
    >
      {ISSUE_STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const selectable = done && enabled;
        return (
          <li key={step} className="flex shrink-0 items-center">
            {i > 0 ? (
              <span className="mx-2 h-px w-4 bg-border-subtle" aria-hidden />
            ) : null}
            <button
              type="button"
              disabled={!selectable}
              onClick={() => selectable && onSelect(step)}
              aria-current={active ? 'step' : undefined}
              className={`pressable flex items-center gap-1.5 rounded-sm text-caption ${
                active
                  ? 'font-semibold text-text-primary'
                  : done
                    ? selectable
                      ? 'text-text-secondary hover:text-text-primary'
                      : 'text-text-secondary'
                    : 'text-text-muted'
              } ${selectable ? '' : 'cursor-default'}`}
            >
              {done ? (
                <Icon name="check" size={13} className="text-success-text" />
              ) : (
                <span className="tnum text-meta">{i + 1}</span>
              )}
              {ISSUE_STEP_LABELS[step]}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
