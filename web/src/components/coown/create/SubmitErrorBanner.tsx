'use client';

import { Icon } from '@/components/ui/Icon';
import {
  stepForSubmitError,
  type IssueStep,
} from './issueDraft';

export interface SubmitError {
  message: string;
  code: string | null;
}

export function SubmitErrorBanner({
  error,
  onJump,
}: {
  error: SubmitError;
  onJump: (step: IssueStep) => void;
}) {
  const target = stepForSubmitError(error.code);
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-border-subtle pb-4"
    >
      <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-danger-text" />
      <div className="min-w-0 flex-1">
        {/* Server text verbatim — the issuer needs the real refusal. */}
        <p className="text-body text-text-primary">{error.message}</p>
        {target ? (
          <button
            type="button"
            onClick={() => onJump(target)}
            className="pressable mt-1 text-caption font-medium text-text-primary underline underline-offset-2"
          >
            Go to {target === 'verify' ? 'verification' : target}
          </button>
        ) : null}
      </div>
    </div>
  );
}
