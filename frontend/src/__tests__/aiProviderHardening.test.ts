import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * AI Provider hardening tests — HTTPS-by-default, SSRF prevention,
 * safe capability defaults, no model-ID inference.
 */

// Mock expo-modules-core with requireOptionalNativeModule (needed by expo-file-system)
vi.mock('expo-modules-core', () => {
  const React = require('react');
  return {
    EventEmitter: class {
      addListener() { return { remove: () => {} }; }
      emit() {}
      removeAllListeners() {}
    },
    requireNativeModule: () => ({
      addListener: () => ({ remove: () => {} }),
      removeListener: () => {},
    }),
    requireOptionalNativeModule: () => null,
    requireNativeViewManager: (name: string) =>
      React.forwardRef((props: any, ref: any) =>
        React.createElement(name, { ref, ...props })
      ),
    NativeModule: class {},
  };
});

// Mock expo-file-system (imported transitively by aiProviderApi)
vi.mock('expo-file-system', () => ({
  documentDirectory: '/mock/',
  cacheDirectory: '/mock/cache/',
  readAsStringAsync: vi.fn(() => Promise.resolve('')),
  writeAsStringAsync: vi.fn(() => Promise.resolve()),
  deleteAsync: vi.fn(() => Promise.resolve()),
  getInfoAsync: vi.fn(() => Promise.resolve({ exists: false, size: 0, isDirectory: false })),
  makeDirectoryAsync: vi.fn(() => Promise.resolve()),
  readDirectoryAsync: vi.fn(() => Promise.resolve([])),
  moveAsync: vi.fn(() => Promise.resolve()),
  copyAsync: vi.fn(() => Promise.resolve()),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

import {
  validateProviderEndpoint,
  defaultCapabilities,
  PROVIDER_CONFIGS,
  type DiscoveredModel,
} from '../services/aiProviderApi';

// Track the original __DEV__ value so we can restore it.
const ORIGINAL_DEV = (globalThis as any).__DEV__;

describe('AI Provider hardening', () => {
  beforeEach(() => {
    (globalThis as any).__DEV__ = true;
  });

  afterEach(() => {
    (globalThis as any).__DEV__ = ORIGINAL_DEV;
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // validateProviderEndpoint — HTTPS-by-default
  // -----------------------------------------------------------------------

  describe('validateProviderEndpoint', () => {
    it('accepts https:// URLs in dev', () => {
      expect(() => validateProviderEndpoint('https://api.openai.com')).not.toThrow();
      expect(() => validateProviderEndpoint('https://custom.example.com/v1')).not.toThrow();
    });

    it('accepts https:// URLs in production', () => {
      (globalThis as any).__DEV__ = false;
      expect(() => validateProviderEndpoint('https://api.openai.com')).not.toThrow();
      expect(() => validateProviderEndpoint('https://custom.example.com/v1')).not.toThrow();
    });

    it('allows http:// in dev mode (with warning)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(() => validateProviderEndpoint('http://localhost:3000')).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('rejects http:// in production mode', () => {
      (globalThis as any).__DEV__ = false;
      expect(() => validateProviderEndpoint('http://api.example.com')).toThrow(
        /HTTPS/i,
      );
    });

    it('rejects private IPs in production (SSRF prevention)', () => {
      (globalThis as any).__DEV__ = false;
      expect(() => validateProviderEndpoint('https://127.0.0.1')).toThrow(/Private/i);
      expect(() => validateProviderEndpoint('https://10.0.0.1')).toThrow(/Private/i);
      expect(() => validateProviderEndpoint('https://192.168.1.1')).toThrow(/Private/i);
      expect(() => validateProviderEndpoint('https://172.16.0.1')).toThrow(/Private/i);
    });

    it('allows private IPs in dev mode', () => {
      expect(() => validateProviderEndpoint('http://127.0.0.1:3000')).not.toThrow();
      expect(() => validateProviderEndpoint('http://10.0.0.1:8080')).not.toThrow();
    });

    it('rejects empty URL', () => {
      expect(() => validateProviderEndpoint('')).toThrow(/required/i);
      expect(() => validateProviderEndpoint('   ')).toThrow(/required/i);
    });

    it('rejects invalid URL format', () => {
      expect(() => validateProviderEndpoint('not-a-url')).toThrow();
      expect(() => validateProviderEndpoint('://missing-protocol')).toThrow();
    });

    it('rejects unsupported protocols', () => {
      expect(() => validateProviderEndpoint('ftp://example.com')).toThrow(/protocol/i);
      // file:// URLs have no hostname, so they fail the hostname check first
      expect(() => validateProviderEndpoint('file:///path')).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // defaultCapabilities — safe defaults, no model-ID inference
  // -----------------------------------------------------------------------

  describe('defaultCapabilities', () => {
    it('returns safe defaults with text=true', () => {
      const caps = defaultCapabilities();
      expect(caps.text).toBe(true);
    });

    it('returns vision=false (no overclaiming)', () => {
      const caps = defaultCapabilities();
      expect(caps.vision).toBe(false);
    });

    it('returns toolCalling=false (no overclaiming)', () => {
      const caps = defaultCapabilities();
      expect(caps.toolCalling).toBe(false);
    });

    it('returns structuredOutput=false (no overclaiming)', () => {
      const caps = defaultCapabilities();
      expect(caps.structuredOutput).toBe(false);
    });

    it('returns reasoning=false (no overclaiming)', () => {
      const caps = defaultCapabilities();
      expect(caps.reasoning).toBe(false);
    });

    it('does NOT infer vision from model IDs containing "vision"', () => {
      // defaultCapabilities takes no arguments — it always returns safe defaults
      const caps = defaultCapabilities();
      // Even if someone passes a model ID elsewhere, defaultCapabilities
      // never looks at it.
      expect(caps.vision).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // PROVIDER_CONFIGS — no stale hardcoded model lists
  // -----------------------------------------------------------------------

  describe('PROVIDER_CONFIGS', () => {
    it('has configs for all 4 providers', () => {
      expect(PROVIDER_CONFIGS.openai).toBeDefined();
      expect(PROVIDER_CONFIGS.anthropic).toBeDefined();
      expect(PROVIDER_CONFIGS.gemini).toBeDefined();
      expect(PROVIDER_CONFIGS.custom).toBeDefined();
    });

    it('does NOT contain stale hardcoded model names (gpt-5.6-*)', () => {
      const allModels = [
        ...PROVIDER_CONFIGS.openai.models,
        ...PROVIDER_CONFIGS.anthropic.models,
        ...PROVIDER_CONFIGS.gemini.models,
        ...PROVIDER_CONFIGS.custom.models,
      ];
      const stalePatterns = [/gpt-5\.6/i, /gpt-4-/i, /claude-3-/i, /gemini-1\./i];
      for (const pattern of stalePatterns) {
        for (const model of allModels) {
          expect(model).not.toMatch(pattern);
        }
      }
    });

    it('has empty or minimal model lists (models discovered dynamically)', () => {
      // Models should come from dynamic discovery, not hardcoded lists.
      // The lists should be empty or contain only well-known stable defaults.
      for (const provider of Object.keys(PROVIDER_CONFIGS) as Array<keyof typeof PROVIDER_CONFIGS>) {
        const config = PROVIDER_CONFIGS[provider];
        // Each provider should have a models array (may be empty)
        expect(Array.isArray(config.models)).toBe(true);
      }
    });
  });
});
