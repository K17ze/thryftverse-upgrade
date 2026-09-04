/**
 * ThryftMediaExport — JS entry point.
 *
 * Wraps the Nitro HybridObject with a graceful fallback when the native
 * module is not linked (Expo Go, web, or during development before
 * Nitrogen codegen has run).
 *
 * When the native module IS linked, `HybridObject.getOrCreate()` returns
 * the singleton instance backed by AVFoundation (iOS) / Media3 (Android).
 * When it is NOT linked, all methods throw with a clear error message
 * directing the developer to run a custom dev client.
 */
import { getHybridObjectConstructor } from 'react-native-nitro-modules';
import type { HybridObject } from 'react-native-nitro-modules';
import type { ThryftMediaExport } from './ThryftMediaExport.nitro';

const MODULE_NAME = 'ThryftMediaExport';

let cachedInstance: ThryftMediaExport | null = null;
let availabilityChecked = false;
let isAvailable = false;

function checkAvailability(): boolean {
  if (availabilityChecked) return isAvailable;
  availabilityChecked = true;
  try {
    // getHybridObjectConstructor throws if the native class is not registered.
    const Constructor = getHybridObjectConstructor<ThryftMediaExport & HybridObject<{}>>(MODULE_NAME);
    cachedInstance = new Constructor();
    isAvailable = true;
  } catch {
    isAvailable = false;
  }
  return isAvailable;
}

function unavailableError(method: string): Error {
  return new Error(
    `ThryftMediaExport.${method}() requires a custom dev client with the ` +
      `Nitro module built. The native export pipeline (AVFoundation on iOS, ` +
      `Media3 Transformer on Android) is not available in Expo Go. ` +
      `Run 'eas build' or 'npx expo run:ios' / 'npx expo run:android' ` +
      `to build a client with the native module linked.`,
  );
}

/**
 * Get the ThryftMediaExport HybridObject instance, or null if the native
 * module is not linked. Use this to gate UI that offers export options.
 */
export function getMediaExport(): ThryftMediaExport | null {
  return checkAvailability() ? cachedInstance : null;
}

/** Returns true if the native export module is linked and ready. */
export function isMediaExportAvailable(): boolean {
  return checkAvailability();
}

// Re-export the types and the HybridObject interface for consumers.
export type {
  ThryftMediaExport,
  ExportIntentRequest,
  ExportResult,
  ExportCapabilities,
  ThumbnailResult,
} from './ThryftMediaExport.nitro';

// Lazy proxy — throws on use if native module is not linked, but allows
// imports at module load time without crashing.
export const ThryftMediaExportModule = new Proxy(
  {} as ThryftMediaExport,
  {
    get(_target, prop: string) {
      if (!checkAvailability()) {
        throw unavailableError(prop);
      }
      return cachedInstance![prop as keyof ThryftMediaExport];
    },
  },
);
