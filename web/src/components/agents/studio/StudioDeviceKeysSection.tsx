'use client';

/**
 * StudioDeviceKeysSection — the "Device keys" tab. Device-local discovery
 * keys in this browser's localStorage: each provider row shows the
 * truthful status (Connected / Invalid / Not connected as coloured text),
 * the masked key, the discovered model list (provider-authoritative, via
 * the real /models probe), and the connect / test / disconnect flows.
 * These keys never leave the device — the note says so plainly.
 */

import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import {
  DEVICE_PROVIDERS,
  maskDeviceKey,
} from './deviceKeys';
import { useDeviceKeys } from './useDeviceKeys';

type KeyStatus = 'connected' | 'not_connected' | 'invalid';

const INPUT_CLS =
  'h-11 w-full rounded-lg border border-border bg-input px-3.5 text-body text-input-text ' +
  'placeholder:text-text-muted focus:border-text-muted focus:outline-none';

export function StudioDeviceKeysSection() {
  const {
    loading,
    providers,
    providerOrder,
    patchProvider,
    startEdit,
    cancelEdit,
    test,
    disconnect,
  } = useDeviceKeys();

  if (loading) {
    return (
      <div className="mt-3 border-y border-border-subtle px-4 sm:px-6" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-4">
            <Skeleton className="h-5 w-5 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <p className="px-4 text-label uppercase tracking-[0.08em] text-text-muted sm:px-6">
        Device-local keys
      </p>
      <p className="mt-1 px-4 text-caption text-text-muted sm:px-6">
        Discovery only — not used for execution. Keys are stored on this
        device in your browser’s local storage and never sync to the server.
      </p>

      <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle px-4 sm:px-6">
        {providerOrder.map((providerId) => {
          const config = DEVICE_PROVIDERS[providerId];
          const state = providers[providerId];
          const status: KeyStatus =
            state.testResult?.status === 'invalid'
              ? 'invalid'
              : state.stored
                ? 'connected'
                : 'not_connected';
          return (
            <li key={providerId} className="py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center text-text-primary">
                  <Icon name="key" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-emphasis text-text-primary">{config.name}</p>
                  <p className="mt-0.5 text-caption text-text-secondary">
                    {config.description}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-caption font-medium ${
                    status === 'connected'
                      ? 'text-success-text'
                      : status === 'invalid'
                        ? 'text-danger-text'
                        : 'text-text-muted'
                  }`}
                >
                  {status === 'connected'
                    ? 'Connected'
                    : status === 'invalid'
                      ? 'Invalid'
                      : 'Not connected'}
                </span>
              </div>

              {/* Connected — masked key + models + actions */}
              {state.stored && !state.editing ? (
                <div className="mt-2">
                  <p className="flex items-center gap-1.5 text-caption text-text-secondary">
                    <Icon name="lock" size={13} className="text-text-muted" />
                    <span className="tnum">{maskDeviceKey(state.stored.apiKey)}</span>
                  </p>
                  {state.stored.baseUrl ? (
                    <p className="mt-0.5 text-caption text-text-muted">
                      Endpoint: {state.stored.baseUrl}
                    </p>
                  ) : null}
                  {state.testResult?.status === 'valid' ? (
                    <p className="mt-1 text-caption text-success-text">
                      {state.testResult.message}
                    </p>
                  ) : null}
                  {state.discoveredModels && state.discoveredModels.length > 0 ? (
                    <p className="mt-1.5 text-caption text-text-secondary">
                      {state.discoveredModels.length}{' '}
                      {state.discoveredModels.length === 1 ? 'model' : 'models'} available
                      {' · '}
                      {state.discoveredModels
                        .slice(0, 8)
                        .map((m) => m.displayName)
                        .join(', ')}
                      {state.discoveredModels.length > 8
                        ? `, +${state.discoveredModels.length - 8} more`
                        : ''}
                    </p>
                  ) : state.discovering ? (
                    <p className="mt-1.5 text-caption text-text-muted">
                      Discovering models…
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-caption text-text-muted">
                    Stored on this device — browser local storage
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-danger-text"
                      onClick={() => disconnect(providerId)}
                    >
                      Disconnect
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(providerId)}
                    >
                      Replace key
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* Not connected — prompt to connect */}
              {!state.stored && !state.editing ? (
                <div className="mt-2">
                  <p className="text-caption text-text-muted">
                    No key saved. Connect to use {config.name} models.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-2"
                    onClick={() => startEdit(providerId)}
                  >
                    Connect
                  </Button>
                </div>
              ) : null}

              {/* Editing — endpoint (custom only) + key + test/save */}
              {state.editing ? (
                <div className="mt-2">
                  <div className="space-y-2.5">
                    {config.supportsBaseUrl ? (
                      <input
                        type="url"
                        value={state.baseUrlInput}
                        onChange={(e) =>
                          patchProvider(providerId, { baseUrlInput: e.target.value })
                        }
                        placeholder="https://your-endpoint/v1"
                        autoComplete="off"
                        aria-label={`${config.name} base URL`}
                        className={INPUT_CLS}
                      />
                    ) : null}
                    <input
                      type="password"
                      value={state.keyInput}
                      onChange={(e) =>
                        patchProvider(providerId, {
                          keyInput: e.target.value,
                          testResult: null,
                        })
                      }
                      placeholder={config.keyPlaceholder}
                      autoComplete="off"
                      aria-label={`${config.name} API key`}
                      className={INPUT_CLS}
                    />
                  </div>

                  <p className="mt-2 text-label uppercase tracking-[0.08em] text-text-muted">
                    Available models
                  </p>
                  {state.discoveredModels && state.discoveredModels.length > 0 ? (
                    <p className="mt-1 text-caption text-text-secondary">
                      {state.discoveredModels.map((m) => m.displayName).join(', ')}
                    </p>
                  ) : state.discovering ? (
                    <p className="mt-1 text-caption text-text-muted">
                      Discovering models from {config.name}…
                    </p>
                  ) : state.discoveredModels && state.discoveredModels.length === 0 ? (
                    <p className="mt-1 text-caption text-text-muted">
                      No models returned by {config.name}.
                    </p>
                  ) : (
                    <p className="mt-1 text-caption text-text-muted">
                      Models are discovered from {config.name} after you connect.
                    </p>
                  )}

                  {state.testResult ? (
                    <p
                      className={`mt-2 text-caption ${
                        state.testResult.status === 'valid'
                          ? 'text-success-text'
                          : 'text-danger-text'
                      }`}
                    >
                      {state.testResult.message}
                    </p>
                  ) : null}

                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelEdit(providerId)}
                      disabled={state.testing}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void test(providerId)}
                      disabled={state.testing || state.keyInput.trim().length === 0}
                    >
                      {state.testing ? 'Testing…' : 'Test & save'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
