/**
 * AHAP pattern definitions for ThryftVerse custom haptics.
 *
 * Each pattern is authored following Apple's Core Haptics design principles
 * (WWDC19 sessions 223 & 810):
 *
 *   - **Intensity** (0.0–1.0): the strength/amplitude of the haptic.
 *   - **Sharpness** (0.0–1.0): the feel — low = round/organic, high = crisp/mechanical.
 *   - **Transient events**: momentary taps/strikes (like a gavel).
 *   - **Continuous events**: sustained vibrations with envelopes (attack/decay/release).
 *
 * Design rules applied to every pattern:
 *   1. Short — most patterns < 200ms; celebrations < 500ms.
 *   2. Textured — varying intensity and sharpness, never a flat buzz.
 *   3. Meaningful — each pattern communicates a specific UI outcome.
 *   4. Causal — the haptic fires at the moment of the visual event.
 *
 * On iOS these AHAP documents are rendered through `CHHapticEngine`.
 * On Android the `android` waveform array is rendered through
 * `VibrationEffect.createWaveform` (API 26+).
 *
 * @see https://developer.apple.com/documentation/corehaptics/representing_haptic_patterns_in_ahap_files
 */

import type { HapticEvent } from 'react-native-haptic-feedback';

import type {
  AhapPattern,
  CrossPlatformHapticPattern,
  HapticPattern,
} from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a transient haptic event at a given time with intensity and sharpness.
 * Time is in seconds (AHAP convention).
 */
function transient(
  time: number,
  intensity: number,
  sharpness: number,
): { Event: { EventType: 'HapticTransient'; Time: number; EventParameters: { ParameterID: 'HapticIntensity' | 'HapticSharpness'; ParameterValue: number }[] } } {
  return {
    Event: {
      EventType: 'HapticTransient',
      Time: time,
      EventParameters: [
        { ParameterID: 'HapticIntensity', ParameterValue: intensity },
        { ParameterID: 'HapticSharpness', ParameterValue: sharpness },
      ],
    },
  };
}

/**
 * Build a continuous haptic event with an envelope (attack, decay, sustain, release).
 * Time and duration are in seconds.
 */
function continuous(
  time: number,
  duration: number,
  intensity: number,
  sharpness: number,
): { Event: { EventType: 'HapticContinuous'; Time: number; EventDuration: number; EventParameters: { ParameterID: 'HapticIntensity' | 'HapticSharpness'; ParameterValue: number }[] } } {
  return {
    Event: {
      EventType: 'HapticContinuous',
      Time: time,
      EventDuration: duration,
      EventParameters: [
        { ParameterID: 'HapticIntensity', ParameterValue: intensity },
        { ParameterID: 'HapticSharpness', ParameterValue: sharpness },
      ],
    },
  };
}

// ─── Pattern definitions ────────────────────────────────────────────────────

/**
 * **confirm** — a crisp double-tap that says "yes, confirmed".
 *
 * Two transient events: a light tap followed 80ms later by a stronger,
 * sharper snap. The rising intensity communicates positive confirmation.
 * Total duration: ~110ms.
 */
const ConfirmPattern: CrossPlatformHapticPattern = {
  description: 'Crisp double-tap — positive confirmation',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Confirm' },
    Pattern: [
      transient(0.0, 0.5, 0.6),
      transient(0.08, 0.9, 0.85),
    ],
  },
  android: [0, 20, 60, 40],
};

/**
 * **reject** — a soft buzz that says "no, rejected".
 *
 * A single low-sharpness continuous event with a quick decay. The round,
 * diffuse character communicates negation without alarm.
 * Total duration: ~120ms.
 */
const RejectPattern: CrossPlatformHapticPattern = {
  description: 'Soft diffuse buzz — negation/rejection',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Reject' },
    Pattern: [
      continuous(0.0, 0.12, 0.4, 0.15),
    ],
  },
  android: [0, 120],
};

/**
 * **gestureStart** — a light tick when a gesture begins.
 *
 * A single soft transient — subtle enough to not distract but present
 * enough to confirm the gesture was registered.
 * Total duration: ~30ms.
 */
const GestureStartPattern: CrossPlatformHapticPattern = {
  description: 'Light tick — gesture began',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Gesture start' },
    Pattern: [
      transient(0.0, 0.35, 0.4),
    ],
  },
  android: [0, 15],
};

/**
 * **gestureEnd** — a slightly heavier tick when a gesture completes.
 *
 * A single transient with higher intensity and sharpness than gestureStart,
 * communicating that the gesture has concluded with a satisfying snap.
 * Total duration: ~30ms.
 */
const GestureEndPattern: CrossPlatformHapticPattern = {
  description: 'Heavier tick — gesture completed',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Gesture end' },
    Pattern: [
      transient(0.0, 0.6, 0.7),
    ],
  },
  android: [0, 25],
};

/**
 * **segmentTick** — a very light tick for segment control changes.
 *
 * The lightest pattern in the vocabulary. Low intensity, moderate sharpness —
 * a barely-perceptible tick that confirms a segment change without
 * interrupting the flow of rapid switching.
 * Total duration: ~20ms.
 */
const SegmentTickPattern: CrossPlatformHapticPattern = {
  description: 'Very light tick — segment change',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Segment tick' },
    Pattern: [
      transient(0.0, 0.2, 0.5),
    ],
  },
  android: [0, 10],
};

/**
 * **toggleOn** — a warm, rising pattern for toggle on.
 *
 * A soft transient followed by a brief continuous event with rising
 * intensity. The low sharpness gives it a warm, organic feel; the rising
 * envelope communicates activation.
 * Total duration: ~180ms.
 */
const ToggleOnPattern: CrossPlatformHapticPattern = {
  description: 'Warm rising pattern — toggle on',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Toggle on' },
    Pattern: [
      transient(0.0, 0.3, 0.2),
      continuous(0.03, 0.15, 0.55, 0.25),
    ],
  },
  android: [0, 10, 20, 80],
};

/**
 * **toggleOff** — a cool, falling pattern for toggle off.
 *
 * A brief continuous event with decreasing intensity, followed by a soft
 * transient. The slightly higher sharpness and falling envelope communicate
 * deactivation — the complement of toggleOn.
 * Total duration: ~180ms.
 */
const ToggleOffPattern: CrossPlatformHapticPattern = {
  description: 'Cool falling pattern — toggle off',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Toggle off' },
    Pattern: [
      continuous(0.0, 0.12, 0.5, 0.35),
      transient(0.14, 0.25, 0.3),
    ],
  },
  android: [0, 60, 30, 15],
};

/**
 * **increment** — a light tick that increases in intensity with each step.
 *
 * The base pattern is a single transient at moderate intensity. The engine
 * scales intensity up on successive calls to communicate progression.
 * Total duration: ~30ms.
 */
const IncrementPattern: CrossPlatformHapticPattern = {
  description: 'Light tick — increasing intensity (stepper up)',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Increment' },
    Pattern: [
      transient(0.0, 0.45, 0.55),
    ],
  },
  android: [0, 20],
};

/**
 * **decrement** — a light tick that decreases in intensity.
 *
 * The base pattern is a single transient at lower intensity than increment.
 * The engine scales intensity down on successive calls to communicate
 * regression.
 * Total duration: ~30ms.
 */
const DecrementPattern: CrossPlatformHapticPattern = {
  description: 'Light tick — decreasing intensity (stepper down)',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Decrement' },
    Pattern: [
      transient(0.0, 0.35, 0.45),
    ],
  },
  android: [0, 15],
};

/**
 * **successCelebration** — two taps with rising intensity.
 *
 * A soft transient followed 120ms later by a strong, sharp snap. The
 * rising intensity communicates a positive outcome — offer accepted,
 * payment completed, auction won.
 * Total duration: ~220ms.
 */
const SuccessCelebrationPattern: CrossPlatformHapticPattern = {
  description: 'Two taps with rising intensity — major success (offer accepted, payment completed)',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Success celebration' },
    Pattern: [
      transient(0.0, 0.4, 0.4),
      transient(0.12, 1.0, 0.85),
    ],
  },
  android: [0, 20, 100, 40],
};

/**
 * **errorShake** — three sharp taps for errors.
 *
 * Three high-sharpness transient events in rapid succession — a mechanical,
 * urgent feel that communicates failure without being alarming. Think of a
 * slot machine landing on "no".
 * Total duration: ~200ms.
 */
const ErrorShakePattern: CrossPlatformHapticPattern = {
  description: 'Three sharp taps — error/failure',
  ahap: {
    Version: 1.0,
    Metadata: { Project: 'ThryftVerse', Description: 'Error shake' },
    Pattern: [
      transient(0.0, 0.7, 0.9),
      transient(0.07, 0.7, 0.9),
      transient(0.14, 0.7, 0.9),
    ],
  },
  android: [0, 30, 40, 30, 40, 30],
};

// ─── Pattern registry ───────────────────────────────────────────────────────

/**
 * Registry of all custom haptic patterns, keyed by name.
 * Used by `HapticsEngine.trigger()` to look up the platform-appropriate
 * pattern definition.
 */
export const HapticPatternRegistry: Record<HapticPattern, CrossPlatformHapticPattern> = {
  confirm: ConfirmPattern,
  reject: RejectPattern,
  gestureStart: GestureStartPattern,
  gestureEnd: GestureEndPattern,
  segmentTick: SegmentTickPattern,
  toggleOn: ToggleOnPattern,
  toggleOff: ToggleOffPattern,
  increment: IncrementPattern,
  decrement: DecrementPattern,
  successCelebration: SuccessCelebrationPattern,
  errorShake: ErrorShakePattern,
};

/**
 * Convert an AHAP pattern into a `HapticEvent[]` sequence compatible with
 * `react-native-haptic-feedback`'s `triggerPattern()` API.
 *
 * The library's `pattern()` shorthand (`o O . - =`) compiles to the same
 * `HapticEvent[]` structure; this function performs the equivalent expansion
 * from a full AHAP document, preserving per-event intensity, sharpness, and
 * continuous durations that the shorthand cannot express.
 *
 * Times are converted from seconds (AHAP convention) to milliseconds
 * (library convention). Used on Android (where AHAP is not supported) and
 * as a universal fallback when `playAHAP()` is unavailable.
 *
 * @param ahap - The AHAP pattern document to convert.
 * @returns An array of `HapticEvent` objects ready for `triggerPattern()`.
 */
export function ahapToHapticEvents(ahap: AhapPattern): HapticEvent[] {
  const events: HapticEvent[] = [];
  for (const entry of ahap.Pattern) {
    if ('Event' in entry) {
      const evt = entry.Event;
      if (evt.EventType === 'HapticTransient') {
        const intensity = evt.EventParameters.find(
          (p) => p.ParameterID === 'HapticIntensity',
        );
        const sharpness = evt.EventParameters.find(
          (p) => p.ParameterID === 'HapticSharpness',
        );
        events.push({
          time: Math.round(evt.Time * 1000),
          type: 'transient',
          intensity: intensity?.ParameterValue,
          sharpness: sharpness?.ParameterValue,
        });
      } else if (evt.EventType === 'HapticContinuous') {
        const intensity = evt.EventParameters.find(
          (p) => p.ParameterID === 'HapticIntensity',
        );
        const sharpness = evt.EventParameters.find(
          (p) => p.ParameterID === 'HapticSharpness',
        );
        events.push({
          time: Math.round(evt.Time * 1000),
          type: 'continuous',
          duration: Math.round(evt.EventDuration * 1000),
          intensity: intensity?.ParameterValue,
          sharpness: sharpness?.ParameterValue,
        });
      }
    }
  }
  return events;
}
