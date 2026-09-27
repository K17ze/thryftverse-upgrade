'use client';

/**
 * PickerSheet — the web counterpart of mobile BottomSheetPicker: a titled
 * sheet with a radio list of options. Used by the personalisation pickers
 * and the density/accent rows on the settings index.
 */

import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/ui/Icon';

export interface PickerOption {
  value: string;
  label: string;
  /** Optional second line under the option label. */
  subtitle?: string;
  /** Colour swatch rendered left of the label (accent presets). */
  swatch?: string;
}

interface PickerSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  options: readonly PickerOption[];
  selectedValue: string | undefined;
  onSelect: (value: string) => void;
  /** Honest footnote rendered under the list — mirror of SheetNote. */
  note?: string;
}

export function PickerSheet({
  open,
  onClose,
  title,
  options,
  selectedValue,
  onSelect,
  note,
}: PickerSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title} maxWidth={480}>
      <ul role="radiogroup" aria-label={title}>
        {options.map((opt) => {
          const selected = opt.value === selectedValue;
          return (
            <li key={opt.value}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  onSelect(opt.value);
                  onClose();
                }}
                className="pressable flex w-full items-center gap-3 border-b border-border-subtle px-5 py-3.5 text-left last:border-b-0"
              >
                {opt.swatch ? (
                  <span
                    aria-hidden
                    className="h-5 w-5 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: opt.swatch }}
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span
                    className={`clamp-1 block text-body-emphasis ${
                      selected ? 'font-medium text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </span>
                  {opt.subtitle ? (
                    <span className="clamp-1 mt-0.5 block text-caption text-text-muted">
                      {opt.subtitle}
                    </span>
                  ) : null}
                </span>
                {selected ? <Icon name="check" size={18} className="shrink-0 text-text-primary" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {note ? <p className="px-5 pb-5 pt-3 text-caption text-text-muted">{note}</p> : null}
    </Sheet>
  );
}
