'use client';

import {
  DURATIONS,
  onRadioGroupKeyDown,
} from './CreateAuctionPrimitives';

interface AuctionScheduleFieldsProps {
  schedule: 'now' | 'later';
  onScheduleChange: (value: 'now' | 'later') => void;
  startAt: string;
  onStartAtChange: (value: string) => void;
  minStart: string;
  durationHours: number;
  onDurationChange: (hours: number) => void;
  error?: string;
}

export function AuctionScheduleFields({
  schedule,
  onScheduleChange,
  startAt,
  onStartAtChange,
  minStart,
  durationHours,
  onDurationChange,
  error,
}: AuctionScheduleFieldsProps) {
  return (
    <>
      {/* Schedule */}
      <div className="flex flex-col gap-2">
        <span className="text-label text-text-secondary">Start</span>
        <div
          className="flex gap-2"
          role="radiogroup"
          aria-label="When the auction opens"
          onKeyDown={onRadioGroupKeyDown}
        >
          {(
            [
              { key: 'now' as const, label: 'Now', hint: 'Opens the moment you create it' },
              { key: 'later' as const, label: 'Schedule', hint: 'Lists under Upcoming until it opens' },
            ]
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={schedule === option.key}
              tabIndex={schedule === option.key ? 0 : -1}
              onClick={() => onScheduleChange(option.key)}
              className={`pressable h-9 flex-1 rounded-md text-caption font-semibold ${
                schedule === option.key
                  ? 'bg-brand text-text-inverse'
                  : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {schedule === 'later' ? (
          <input
            type="datetime-local"
            value={startAt}
            min={minStart}
            onChange={(event) => onStartAtChange(event.target.value)}
            aria-label="Scheduled start"
            aria-invalid={!!error}
            className="h-12 w-full rounded-lg border border-border bg-input px-4 text-body text-input-text outline-none focus:border-text-muted"
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-caption text-danger-text">{error}</p>
        ) : (
          <p className="text-meta text-text-muted">
            {schedule === 'later'
              ? 'The window starts when it opens — a scheduled auction sits under Upcoming.'
              : 'The window starts as soon as it goes live.'}
          </p>
        )}
      </div>

      {/* Duration */}
      <div className="flex flex-col gap-2">
        <span className="text-label text-text-secondary">Duration</span>
        <div className="flex gap-2">
          {DURATIONS.map((option) => (
            <button
              key={option.hours}
              type="button"
              aria-pressed={durationHours === option.hours}
              onClick={() => onDurationChange(option.hours)}
              className={`pressable h-9 flex-1 rounded-md text-caption font-semibold ${
                durationHours === option.hours
                  ? 'bg-brand text-text-inverse'
                  : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-meta text-text-muted">
          {DURATIONS.find((option) => option.hours === durationHours)?.hint ?? ''} window
        </p>
      </div>
    </>
  );
}
