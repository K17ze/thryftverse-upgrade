/**
 * AHAP pattern loader and cross-platform player.
 *
 * Loads Apple Haptic Audio Pattern (AHAP) JSON documents from
 * `src/platform/haptics/ahap/` and plays them through the native haptic
 * engine. On iOS the events are rendered through Core Haptics
 * (`CHHapticEngine`); on Android the AHAP event sequence is converted to a
 * `VibrationEffect` waveform composition so the same authored pattern
 * communicates the same intent on both platforms.
 *
 * This integrates with — and does not replace — the existing
 * `HapticsEngine` and `HapticPatternRegistry`. Built-in named patterns
 * (`successCelebration`, `errorShake`, …) remain the primary API; the
 * file-backed loader here is for patterns authored as standalone AHAP
 * documents (e.g. imported from Apple's Haptic Studio or design tooling).
 *
 * @see https://developer.apple.com/documentation/corehaptics/representing_haptic_patterns_in_ahap_files
 */

import { Platform } from 'react-native';

import type { HapticEvent } from 'react-native-haptic-feedback';

import { ahapToHapticEvents } from './hapticPatterns';
import { triggerPatternEvents } from './HapticsEngine';
import type { AhapPattern, AndroidVibrationPattern } from './types';

import successAhap from './ahap/success.json';
import errorAhap from './ahap/error.json';
import warningAhap from './ahap/warning.json';

/**
 * A file-backed AHAP pattern paired with its Android vibration waveform
 * fallback. The Android waveform is an alternating off/on duration array
 * (milliseconds) compatible with `VibrationEffect.createWaveform`.
 */
interface AhapPatternEntry {
  ahap: AhapPattern;
  android: AndroidVibrationPattern;
}

/**
 * Registry of file-backed AHAP patterns, keyed by file name (without
 * extension). New patterns are added by dropping a `.json` file into
 * `src/platform/haptics/ahap/` and registering it here with an Android
 * waveform mapping.
 */
const AHAP_REGISTRY: Record<string, AhapPatternEntry> = {
  success: {
    ahap: successAhap as AhapPattern,
    android: [0, 20, 100, 40],
  },
  error: {
    ahap: errorAhap as AhapPattern,
    android: [0, 30, 40, 30, 40, 30],
  },
  warning: {
    ahap: warningAhap as AhapPattern,
    android: [0, 40, 60, 40],
  },
};

/**
 * Load an AHAP pattern document by name.
 *
 * @param name - The pattern file name without extension (e.g. `'success'`).
 * @returns The AHAP document, or `null` if no pattern is registered for
 *          the given name.
 */
export function loadAhapPattern(name: string): AhapPattern | null {
  const entry = AHAP_REGISTRY[name];
  return entry ? entry.ahap : null;
}

/**
 * Convert an Android vibration waveform (alternating off/on ms durations)
 * into a `HapticEvent[]` sequence compatible with the native pattern player.
 * Even indices are off-duration gaps, odd indices are on-duration pulses.
 */
function androidWaveformToEvents(waveform: AndroidVibrationPattern): HapticEvent[] {
  const events: HapticEvent[] = [];
  let time = 0;
  for (let i = 0; i < waveform.length; i += 2) {
    const off = waveform[i] ?? 0;
    const on = waveform[i + 1] ?? 0;
    time += off;
    if (on > 0) {
      events.push({
        time,
        type: 'continuous',
        duration: on,
        intensity: 0.7,
        sharpness: 0.6,
      });
      time += on;
    }
  }
  return events;
}

/**
 * Play a file-backed AHAP pattern by name.
 *
 * On iOS the AHAP event sequence is rendered through Core Haptics. On
 * Android the registered VibrationEffect waveform composition is played
 * instead, mapping the authored intent to the platform-appropriate
 * primitive. The call is a no-op when haptics are disabled or the pattern
 * name is unknown.
 *
 * @param name - The pattern file name without extension (e.g. `'success'`).
 */
export function playAhapPattern(name: string): void {
  const entry = AHAP_REGISTRY[name];
  if (!entry) return;

  let events: HapticEvent[];
  if (Platform.OS === 'ios') {
    events = ahapToHapticEvents(entry.ahap);
  } else {
    events = androidWaveformToEvents(entry.android);
  }
  triggerPatternEvents(events);
}
