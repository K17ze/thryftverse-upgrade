'use client';

/**
 * TagField — discovery tags with autocomplete, ported from the mobile
 * TagInputWithSuggestions: chips + inline input share one field chrome,
 * debounced suggestions render in an anchored listbox. Enter or comma
 * commits (mobile splits on whitespace too); Backspace on an empty input
 * pops the last tag.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useTagAutocomplete } from '@/lib/hooks/sell/useTagAutocomplete';
import { parseTagInput } from '@/lib/hooks/sell/tagTaxonomy';
import { MAX_TAGS } from './constants';
import { SellField } from './SellField';

const LISTBOX_ID = 'sell-tags-listbox';

interface TagFieldProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagField({ tags, onChange }: TagFieldProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const { suggestions } = useTagAutocomplete(input, tags);
  const full = tags.length >= MAX_TAGS;

  const commit = (raw: string) => {
    const parts = parseTagInput(raw);
    if (!parts.length) return;
    onChange([...new Set([...tags, ...parts])].slice(0, MAX_TAGS));
    setInput('');
    setActiveIndex(-1);
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  // Close on pointer-down outside field + dropdown (mirrors Header search).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      if (suggestions.length) setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length) {
        setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      }
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        commit(suggestions[activeIndex]);
      } else {
        commit(input);
      }
      close();
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === 'Backspace' && !input && tags.length) {
      remove(tags[tags.length - 1]);
    }
  };

  return (
    <SellField
      id="sell-field-tags"
      label="Tags"
      optional
      hint="Buyers search these — a style, era, colour or material. Up to 8."
    >
      <div ref={boxRef} className="relative">
        <div className="flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-md border border-border bg-input px-3 py-2 transition-colors focus-within:border-text-muted">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-surface-alt px-2 text-caption font-medium text-text-primary"
            >
              #{tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => remove(tag)}
                className="pressable -mr-0.5 flex h-5 w-5 items-center justify-center rounded-sm text-text-muted hover:text-text-primary"
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
          {!full ? (
            <input
              id="sell-field-tags"
              type="text"
              value={input}
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-controls={LISTBOX_ID}
              aria-autocomplete="list"
              aria-activedescendant={
                open && activeIndex >= 0 ? `${LISTBOX_ID}-option-${activeIndex}` : undefined
              }
              autoComplete="off"
              onChange={(e) => {
                setInput(e.target.value);
                setOpen(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setOpen(true)}
              onBlur={(e) => {
                if (!boxRef.current?.contains(e.relatedTarget as Node)) close();
              }}
              onKeyDown={onKeyDown}
              placeholder={tags.length === 0 ? 'vintage, y2k, oversized…' : 'Add tag'}
              maxLength={40}
              className="h-7 min-w-[120px] flex-1 bg-transparent text-body text-input-text placeholder:text-text-muted focus:outline-none"
            />
          ) : null}
        </div>

        {open && suggestions.length > 0 ? (
          <div
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Tag suggestions"
            className="absolute left-0 right-0 top-full z-dropdown mt-2 overflow-hidden rounded-lg border border-border-subtle bg-surface-elevated py-1 shadow-floating"
          >
            {suggestions.map((term, i) => (
              <div
                key={term}
                id={`${LISTBOX_ID}-option-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => {
                  // Commit before the input blurs; keep focus in the field.
                  e.preventDefault();
                  commit(term);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-left ${
                  i === activeIndex ? 'bg-row' : ''
                }`}
              >
                <Icon name="tag" size={16} className="shrink-0 text-text-muted" />
                <span className="clamp-1 min-w-0 flex-1 text-body text-text-primary">
                  {term}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </SellField>
  );
}
