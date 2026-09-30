'use client';

import { Icon } from '@/components/ui/Icon';
import { FIELD_LABEL, INPUT } from './CreateStreamPrimitives';

interface CreateStreamSchedulePickerProps {
  isLive: boolean;
  schedule: 'now' | 'later';
  onScheduleChange: (mode: 'now' | 'later') => void;
  startAt: string;
  onStartAtChange: (val: string) => void;
  minStart: string;
  scheduling: boolean;
  error?: string;
}

export function CreateStreamSchedulePicker({
  isLive,
  schedule,
  onScheduleChange,
  startAt,
  onStartAtChange,
  minStart,
  scheduling,
  error,
}: CreateStreamSchedulePickerProps) {
  return (
    <fieldset className="border-t border-border-subtle pt-6">
      <legend className={FIELD_LABEL}>Start time</legend>
      {isLive ? (
        <div className="mt-3">
          <input
            type="datetime-local"
            value={startAt}
            min={minStart}
            onChange={(e) => onStartAtChange(e.target.value)}
            aria-label="Scheduled start"
            className={INPUT}
          />
          <p className="mt-1.5 text-meta text-text-muted">
            Scheduled shows appear in Coming up — followers get notified when you go live.
            Open the host console when it&apos;s time — web or mobile.
          </p>
        </div>
      ) : (
        <div className="mt-3" role="radiogroup" aria-label="When to start">
          {(
            [
              { key: 'now' as const, label: 'Now', meta: 'Go live immediately' },
              { key: 'later' as const, label: 'Later', meta: 'Schedule the show' },
            ]
          ).map((option) => {
            const selected = schedule === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onScheduleChange(option.key)}
                className="pressable flex w-full items-center justify-between border-b border-border-subtle py-3 text-left last:border-b-0"
              >
                <span>
                  <span className="block text-body font-medium text-text-primary">{option.label}</span>
                  <span className="mt-0.5 block text-meta text-text-muted">{option.meta}</span>
                </span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                    selected ? 'border-brand' : 'border-border'
                  }`}
                >
                  {selected ? <Icon name="check" size={13} className="text-text-primary" /> : null}
                </span>
              </button>
            );
          })}
          {scheduling ? (
            <div className="mt-3">
              <input
                type="datetime-local"
                value={startAt}
                min={minStart}
                onChange={(e) => onStartAtChange(e.target.value)}
                aria-label="Scheduled start"
                className={INPUT}
              />
              <p className="mt-1.5 text-meta text-text-muted">
                Scheduled shows appear in Coming up — followers get notified when you go live.
              </p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="mt-1.5 text-caption text-danger-text">{error}</p>
          ) : null}
        </div>
      )}
      {isLive && error ? (
        <p role="alert" className="mt-1.5 text-caption text-danger-text">{error}</p>
      ) : null}
    </fieldset>
  );
}
