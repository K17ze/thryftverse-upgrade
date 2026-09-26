'use client';

/**
 * AuthField — one auth form field: quiet label, Inter input grammar
 * (h-11 rounded-md bg-input border px-3.5), trailing slot for controls
 * like the password eye toggle, inline error line.
 */

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  trailing?: ReactNode;
}

export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, error, trailing, id, className = '', ...rest },
  ref,
) {
  const inputId = id ?? rest.name ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-caption font-medium text-text-secondary">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`h-11 w-full rounded-md border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none ${
            error ? 'border-danger-border' : 'border-border'
          } ${trailing ? 'pr-12' : ''} ${className}`}
          {...rest}
        />
        {trailing}
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
});
