'use client';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';

const INPUT_CLS =
  'h-11 w-full rounded-lg border border-border bg-input px-3.5 text-body text-input-text ' +
  'placeholder:text-text-muted focus:border-text-muted focus:outline-none';

interface ConnectionFormProps {
  provider: 'openai' | 'custom';
  setProvider: (p: 'openai' | 'custom') => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  label: string;
  setLabel: (l: string) => void;
  baseUrl: string;
  setBaseUrl: (u: string) => void;
  creating: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export function ConnectionForm({
  provider,
  setProvider,
  apiKey,
  setApiKey,
  label,
  setLabel,
  baseUrl,
  setBaseUrl,
  creating,
  onCancel,
  onSubmit,
}: ConnectionFormProps) {
  return (
    <div className="mt-3 px-4 sm:px-6">
      {/* Only the providers the server verification contract supports
          are offered — OpenAI plus custom OpenAI-compatible endpoints.
          Anthropic and Gemini remain planned, not "coming soon" chrome. */}
      <div className="flex gap-2" aria-label="Provider">
        {(['openai', 'custom'] as const).map((p) => (
          <Chip key={p} selected={provider === p} onClick={() => setProvider(p)}>
            {p === 'openai' ? 'OpenAI' : 'Custom'}
          </Chip>
        ))}
      </div>
      <div className="mt-3 space-y-2.5">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key"
          autoComplete="off"
          aria-label="Server connection API key"
          className={INPUT_CLS}
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          aria-label="Server connection label"
          className={INPUT_CLS}
        />
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Base URL (optional, custom providers)"
          autoComplete="off"
          aria-label="Server connection base URL"
          className={INPUT_CLS}
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={creating}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={creating || apiKey.trim().length === 0}
        >
          {creating ? 'Verifying…' : 'Verify & save'}
        </Button>
      </div>
    </div>
  );
}
