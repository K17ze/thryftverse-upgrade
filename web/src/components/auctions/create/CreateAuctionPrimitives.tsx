'use client';

import React from 'react';

export const DURATIONS = [
  { hours: 3, label: '3h', hint: 'Blitz' },
  { hours: 6, label: '6h', hint: 'Standard' },
  { hours: 12, label: '12h', hint: 'Evening' },
  { hours: 24, label: '24h', hint: 'Full day' },
];

export interface FormErrors {
  item?: string;
  startingBid?: string;
  buyNow?: string;
  reserve?: string;
  schedule?: string;
}

/**
 * Radio-group keyboard grammar — the checkout SelectionList pattern:
 * roving tabindex (only the selected, or the first enabled, radio is
 * tabbable) and arrows/Home/End that move focus AND selection, matching
 * the ARIA radio-group pattern.
 */
export function onRadioGroupKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
  );
  const current = radios.indexOf(document.activeElement as HTMLElement);
  if (current < 0) return;
  let next = -1;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    next = (current + 1) % radios.length;
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    next = (current - 1 + radios.length) % radios.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = radios.length - 1;
  }
  if (next < 0 || next === current) return;
  event.preventDefault();
  const target = radios[next];
  target?.focus();
  target?.click();
}

/** Earliest schedulable slot — five minutes out, post-mount so SSR agrees. */
export function minStartValue(now: number): string {
  const d = new Date(now + 5 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatScheduledStart(iso: string): string {
  const at = new Date(iso);
  return `${at.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} · ${at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
