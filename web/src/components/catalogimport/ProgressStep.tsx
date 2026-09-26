'use client';

/**
 * ProgressStep — staged import progress with deterministic ticks, never a
 * fabricated percentage. A calm centred statement carries the viewport;
 * the phase list and hairline track are the only quantitative signal.
 * The commit already happened — this narrates the pipeline honestly.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { ImportSource } from './core';

interface ProgressStepProps {
  source: ImportSource;
  onDone: () => void;
}

const PHASE_MS = [650, 850, 700];

export function ProgressStep({ source, onDone }: ProgressStepProps) {
  const phases = [
    source === 'csv' ? 'Reading your file' : 'Reading your listings',
    'Checking rows',
    'Preparing drafts',
  ];
  const [index, setIndex] = useState(0);

  // Keep the callback out of the effect deps so a parent re-render can't
  // restart the staged sequence.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (index >= PHASE_MS.length) {
      doneRef.current();
      return undefined;
    }
    const timer = setTimeout(() => setIndex((i) => i + 1), PHASE_MS[index]);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div className="flex min-h-[48vh] flex-col items-center justify-center text-center">
      <h1 className="text-screen-title font-bold text-text-primary">
        Importing your catalogue
      </h1>
      <p className="mt-2 text-body text-text-secondary">
        {index < phases.length ? phases[index] : 'Ready to review'}
      </p>

      {/* ── Deterministic track — completed phases only ── */}
      <div
        className="mt-6 h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-border-subtle"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={phases.length}
        aria-valuenow={Math.min(index, phases.length)}
      >
        <div
          className="h-full bg-brand transition-all duration-500"
          style={{ width: `${(Math.min(index, phases.length) / phases.length) * 100}%` }}
        />
      </div>

      <ol className="mt-8 w-full max-w-xs space-y-3 text-left">
        {phases.map((label, i) => {
          const state = i < index ? 'done' : i === index ? 'active' : 'pending';
          return (
            <li key={label} className="flex items-center gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {state === 'done' ? (
                  <Icon name="check" size={16} className="text-success-text" />
                ) : state === 'active' ? (
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-border-subtle border-t-brand"
                  />
                ) : (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-border" />
                )}
              </span>
              <span
                className={`text-body ${
                  state === 'pending' ? 'text-text-muted' : 'text-text-primary'
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
