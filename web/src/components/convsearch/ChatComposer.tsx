'use client';

/**
 * ChatComposer — the conversational-search input bar.
 * Same field grammar as SearchField (rounded-xl, border, input text) with a
 * send glyph instead of a search glyph.
 */

import { Icon } from '@/components/ui/Icon';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export function ChatComposer({ value, onChange, onSubmit, disabled }: ChatComposerProps) {
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <form
      role="search"
      aria-label="Conversational search"
      className="flex items-end gap-2 border-t border-border-subtle pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit(value);
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Describe what you are looking for</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Try “denim jacket under £40”…"
          enterKeyHint="send"
          autoComplete="off"
          disabled={disabled}
          className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-body-emphasis text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none disabled:opacity-60"
        />
      </label>
      <button
        type="submit"
        aria-label="Send message"
        disabled={!canSend}
        className={`pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          canSend ? 'bg-brand text-text-inverse' : 'bg-surface-alt text-text-muted'
        }`}
      >
        <Icon name="send" size={19} />
      </button>
    </form>
  );
}
