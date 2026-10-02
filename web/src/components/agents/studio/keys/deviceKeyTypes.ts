// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeviceProvider = 'openai' | 'anthropic' | 'gemini' | 'custom';

export interface DeviceProviderConfig {
  id: DeviceProvider;
  name: string;
  description: string;
  /** Expected key prefix(es) for format validation. Empty = no rule. */
  keyPrefixes: string[];
  minKeyLength: number;
  supportsBaseUrl: boolean;
  keyPlaceholder: string;
}

export interface StoredDeviceKey {
  provider: DeviceProvider;
  apiKey: string;
  baseUrl?: string;
  /** Always 'browser' on web — the honest storage class. */
  storageClass: 'browser';
  savedAt: string;
}

export interface DiscoveredModel {
  providerModelId: string;
  displayName: string;
  deprecated?: boolean;
}

export type DeviceKeyTestResult =
  | { status: 'valid'; message: string; models?: DiscoveredModel[] }
  | { status: 'invalid'; message: string };

// ---------------------------------------------------------------------------
// Provider catalogue — same four providers as mobile, same format rules.
// ---------------------------------------------------------------------------

export const DEVICE_PROVIDERS: Record<DeviceProvider, DeviceProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description:
      'OpenAI chat and reasoning models. Available models are discovered from your account.',
    keyPrefixes: ['sk-'],
    minKeyLength: 20,
    supportsBaseUrl: false,
    keyPlaceholder: 'sk-...',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description:
      'Anthropic Claude chat models. Available models are discovered from your account.',
    keyPrefixes: ['sk-ant-'],
    minKeyLength: 40,
    supportsBaseUrl: false,
    keyPlaceholder: 'sk-ant-...',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description:
      'Google Gemini multimodal models. Available models are discovered from your account.',
    keyPrefixes: ['AIza'],
    minKeyLength: 30,
    supportsBaseUrl: false,
    keyPlaceholder: 'AIza...',
  },
  custom: {
    id: 'custom',
    name: 'Custom endpoint',
    description:
      'Any OpenAI-compatible endpoint (LM Studio, Ollama, vLLM, Together, Groq, etc.).',
    keyPrefixes: [],
    minKeyLength: 8,
    supportsBaseUrl: true,
    keyPlaceholder: 'API key (optional for local servers)',
  },
};

export const DEVICE_PROVIDER_ORDER: DeviceProvider[] = [
  'openai',
  'anthropic',
  'gemini',
  'custom',
];
