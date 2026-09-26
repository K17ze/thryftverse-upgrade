'use client';

/**
 * Switch — the one toggle grammar. 44px hit area, 28px visible track,
 * role=switch for assistive tech.
 */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  'aria-label': string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, disabled, 'aria-label': ariaLabel }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className="pressable flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-50"
    >
      <span
        className={`relative h-7 w-12 rounded-full transition-colors duration-150 ${
          checked ? 'bg-brand' : 'bg-surface-raised border border-border'
        }`}
      >
        <span
          className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-[left,background-color] duration-150 ${
            checked ? 'left-[26px] bg-text-inverse' : 'left-[3px] bg-text-muted'
          }`}
        />
      </span>
    </button>
  );
}
