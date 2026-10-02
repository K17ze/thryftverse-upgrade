import type { DeviceProvider, DiscoveredModel } from './deviceKeyTypes';

// ---------------------------------------------------------------------------
// Provider round-trip — the real probe. A connection is "valid" only when
// the provider answers; the parsed model list is provider-authoritative.
// ---------------------------------------------------------------------------

export function parseProviderModels(provider: DeviceProvider, body: unknown): DiscoveredModel[] {
  if (!body || typeof body !== 'object') return [];
  try {
    switch (provider) {
      case 'openai':
      case 'custom': {
        const data = (body as { data?: unknown }).data;
        if (!Array.isArray(data)) return [];
        return data
          .map((m): DiscoveredModel | null => {
            const id = typeof (m as { id?: unknown })?.id === 'string'
              ? (m as { id: string }).id
              : null;
            return id
              ? {
                  providerModelId: id,
                  displayName: id,
                  deprecated: (m as { deprecated?: unknown })?.deprecated === true,
                }
              : null;
          })
          .filter((m): m is DiscoveredModel => m !== null);
      }
      case 'anthropic': {
        const data =
          (body as { data?: unknown }).data ?? (body as { models?: unknown }).models;
        if (!Array.isArray(data)) return [];
        return data
          .map((m): DiscoveredModel | null => {
            const id = typeof (m as { id?: unknown })?.id === 'string'
              ? (m as { id: string }).id
              : null;
            return id
              ? {
                  providerModelId: id,
                  displayName:
                    typeof (m as { display_name?: unknown })?.display_name === 'string'
                      ? (m as { display_name: string }).display_name
                      : id,
                  deprecated: (m as { deprecated?: unknown })?.deprecated === true,
                }
              : null;
          })
          .filter((m): m is DiscoveredModel => m !== null);
      }
      case 'gemini': {
        const models = (body as { models?: unknown }).models;
        if (!Array.isArray(models)) return [];
        return models
          .map((m): DiscoveredModel | null => {
            const raw = typeof (m as { name?: unknown })?.name === 'string'
              ? (m as { name: string }).name
              : null;
            if (!raw) return null;
            const id = raw.replace(/^models\//, '');
            return { providerModelId: id, displayName: id };
          })
          .filter((m): m is DiscoveredModel => m !== null);
      }
    }
  } catch {
    return [];
  }
}

export async function probeProvider(
  provider: DeviceProvider,
  apiKey: string,
  baseUrl?: string,
): Promise<{ ok: boolean; message: string; models?: DiscoveredModel[] }> {
  const trimmedKey = apiKey.trim();
  const trimmedBase = baseUrl?.trim() || undefined;

  let url: string;
  let headers: Record<string, string>;
  switch (provider) {
    case 'openai':
      url = trimmedBase ?? 'https://api.openai.com/v1/models';
      headers = { Authorization: `Bearer ${trimmedKey}` };
      break;
    case 'anthropic':
      url = trimmedBase ?? 'https://api.anthropic.com/v1/models';
      headers = {
        'x-api-key': trimmedKey,
        'anthropic-version': '2023-06-01',
        // Anthropic's browser-access opt-in — the real CORS contract for
        // direct browser calls. Without it the probe cannot run from a web
        // origin at all.
        'anthropic-dangerous-direct-browser-access': 'true',
      };
      break;
    case 'gemini':
      url = trimmedBase
        ? `${trimmedBase.replace(/\/$/, '')}/models`
        : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmedKey)}`;
      headers = {};
      break;
    case 'custom':
      if (!trimmedBase) {
        return { ok: false, message: 'Custom endpoint requires a base URL.' };
      }
      url = `${trimmedBase.replace(/\/$/, '')}/models`;
      headers = trimmedKey ? { Authorization: `Bearer ${trimmedKey}` } : {};
      break;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'Authentication failed — key rejected by provider.' };
    }
    if (response.status === 429) {
      return { ok: false, message: 'Rate limited — try again in a moment.' };
    }
    if (response.status >= 500) {
      return { ok: false, message: 'Provider unavailable — try again later.' };
    }
    if (!response.ok) {
      return { ok: false, message: `Provider returned HTTP ${response.status}.` };
    }
    let models: DiscoveredModel[] = [];
    try {
      models = parseProviderModels(provider, await response.json());
    } catch {
      // 200 with an unrecognisable body — still a valid connection.
    }
    return { ok: true, message: 'Connected — key verified by provider.', models };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, message: 'Request timed out — check your connection.' };
    }
    return {
      ok: false,
      message:
        'Endpoint unreachable from this browser — check the URL, your network, or whether the provider allows browser calls.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
