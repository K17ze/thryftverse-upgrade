/**
 * Type definitions for the ThryftVerse Core Haptics abstraction.
 *
 * This module provides a strictly-typed superset of the expo-haptics API
 * built on top of react-native-haptic-feedback v3 (Core Haptics on iOS,
 * VibrationEffect on Android). Every type here is designed so that existing
 * expo-haptics call sites can migrate by changing imports only, while new
 * code gains access to custom AHAP patterns, rate limiting, and worklet
 * compatibility.
 *
 * @see https://developer.apple.com/documentation/corehaptics/representing_haptic_patterns_in_ahap_files
 */

// ─── Impact & notification (superset of expo-haptics) ───────────────────────

/**
 * Impact feedback styles — mirrors `expo-haptics.ImpactFeedbackStyle` plus
 * the two iOS 16+ additions (`rigid`, `soft`) that react-native-haptic-feedback
 * supports natively via Core Haptics.
 */
export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';

/**
 * Notification feedback types — mirrors `expo-haptics.NotificationFeedbackType`.
 */
export type HapticNotificationType = 'success' | 'warning' | 'error';

// ─── Named custom patterns ──────────────────────────────────────────────────

/**
 * Named custom haptic patterns that go beyond expo-haptics primitives.
 *
 * Each name maps to a hand-authored AHAP pattern (iOS) and a corresponding
 * vibration waveform (Android) in `hapticPatterns.ts`.
 */
export type HapticPattern =
  | 'confirm'
  | 'reject'
  | 'gestureStart'
  | 'gestureEnd'
  | 'segmentTick'
  | 'toggleOn'
  | 'toggleOff'
  | 'increment'
  | 'decrement'
  | 'successCelebration'
  | 'errorShake';

/**
 * Android fallback vibration waveform.
 *
 * Alternating on/off durations in milliseconds, compatible with
 * `VibrationEffect.createWaveform` (API 26+) and the legacy `Vibration.vibrate`
 * pattern API. Even indices are off-duration, odd indices are on-duration.
 */
export type AndroidVibrationPattern = number[];

// ─── AHAP schema (Apple Haptic and Audio Pattern) ───────────────────────────

/**
 * Apple AHAP event parameter IDs.
 * @see https://developer.apple.com/documentation/corehaptics/chhapticeventparameter/parameterid
 */
export type AhapEventParameterID =
  | 'HapticIntensity'
  | 'HapticSharpness'
  | 'AttackTime'
  | 'DecayTime'
  | 'ReleaseTime'
  | 'Sustained'
  | 'AudioVolume'
  | 'AudioPitch'
  | 'AudioPan'
  | 'AudioBrightness';

/**
 * Apple AHAP dynamic parameter IDs used in parameter curves.
 */
export type AhapDynamicParameterID =
  | 'HapticIntensityControl'
  | 'HapticSharpnessControl'
  | 'HapticAttackTimeControl'
  | 'HapticDecayTimeControl'
  | 'HapticReleaseTimeControl'
  | 'AudioVolumeControl'
  | 'AudioPanControl'
  | 'AudioBrightnessControl'
  | 'AudioPitchControl'
  | 'AudioAttackTimeControl'
  | 'AudioDecayTimeControl'
  | 'AudioReleaseTimeControl';

/**
 * A single parameter value attached to an AHAP event.
 */
export interface AhapEventParameterValue {
  ParameterID: AhapEventParameterID;
  /** 0.0 – 1.0 for intensity/sharpness; time in seconds for attack/decay/release. */
  ParameterValue: number;
}

/**
 * A control point on an AHAP parameter curve (used for fades and envelopes).
 */
export interface AhapParameterCurveControlPoint {
  /** Time offset from the curve start, in seconds. */
  Time: number;
  ParameterValue: number;
}

/**
 * A single event entry in an AHAP Pattern array.
 *
 * - `HapticTransient`: a short, momentary tap/strike.
 * - `HapticContinuous`: a sustained vibration with a duration.
 * - `AudioCustom`: a custom audio waveform played in sync (unused here).
 */
export type AhapEventPattern =
  | {
      Event: {
        EventType: 'HapticTransient';
        /** Time offset from pattern start, in seconds. */
        Time: number;
        EventParameters: AhapEventParameterValue[];
      };
    }
  | {
      Event: {
        EventType: 'HapticContinuous';
        /** Time offset from pattern start, in seconds. */
        Time: number;
        /** Duration of the continuous event, in seconds. */
        EventDuration: number;
        EventParameters: AhapEventParameterValue[];
      };
    }
  | {
      Event: {
        EventType: 'AudioCustom';
        Time: number;
        EventWaveformPath: string;
        EventParameters: AhapEventParameterValue[];
      };
    };

/**
 * A parameter curve entry in an AHAP Pattern array.
 *
 * Parameter curves allow dynamic modulation of a parameter over time —
 * e.g. fading intensity from 1.0 to 0.0 across a continuous event.
 */
export interface AhapParameterCurvePattern {
  ParameterCurve: {
    ParameterID: AhapDynamicParameterID;
    /** Time offset from pattern start, in seconds. */
    Time: number;
    ParameterCurveControlPoints: AhapParameterCurveControlPoint[];
  };
}

/**
 * The top-level AHAP document — Apple's JSON format for defining haptic
 * patterns. Each pattern is a sequence of events and optional parameter
 * curves that Core Haptics renders through the Taptic Engine.
 *
 * @see https://developer.apple.com/documentation/corehaptics/representing_haptic_patterns_in_ahap_files
 */
export interface AhapPattern {
  Version: 1.0;
  Metadata?: {
    Project?: string;
    Created?: string;
    Description?: string;
  };
  Pattern: (AhapEventPattern | AhapParameterCurvePattern)[];
}

// ─── Cross-platform pattern definition ──────────────────────────────────────

/**
 * A complete cross-platform haptic pattern definition.
 *
 * On iOS, `ahap` is rendered through Core Haptics (`CHHapticEngine`).
 * On Android, `android` is rendered through `VibrationEffect.createWaveform`.
 */
export interface CrossPlatformHapticPattern {
  /** The AHAP document for iOS Core Haptics. */
  ahap: AhapPattern;
  /** Android fallback vibration waveform (ms durations, alternating off/on). */
  android: AndroidVibrationPattern;
  /** Human-readable description of the pattern's intent. */
  description: string;
}

// ─── Engine configuration ───────────────────────────────────────────────────

/**
 * Configuration for the HapticsEngine.
 *
 * Mirrors the `HapticOptions` from `react-native-haptic-feedback` with an
 * added `enabled` kill-switch. All fields are required so that `configure()`
 * callers make an explicit choice about every dimension.
 */
export interface HapticsEngineConfig {
  /**
   * Whether haptics are globally enabled. When `false`, all triggers are
   * no-ops. This is typically driven by a user preference stored in MMKV
   * and/or the OS-level haptic setting.
   */
  enabled: boolean;
  /**
   * On Android, fall back to plain `Vibration.vibrate()` when the device
   * lacks a `Vibrator` hardware effect engine. On iOS this is ignored.
   */
  enableVibrateFallback: boolean;
  /**
   * On Android, ignore the system haptic settings (e.g. when the user has
   * disabled vibrations in Settings). Use with caution — this overrides a
   * user's OS-level preference. On iOS this is ignored.
   */
  ignoreAndroidSystemSettings: boolean;
}

// ─── Hook return type ───────────────────────────────────────────────────────

/**
 * The API surface returned by `useHaptics()`.
 *
 * All methods are synchronous, fire-and-forget, and safe to call from
 * Reanimated worklets. They are no-ops when haptics are disabled.
 */
export interface HapticsAPI {
  /** Trigger an impact haptic (light/medium/heavy/rigid/soft). */
  impact: (style: HapticImpactStyle) => void;
  /** Trigger a notification haptic (success/warning/error). */
  notification: (type: HapticNotificationType) => void;
  /** Trigger a light selection tick. */
  selection: () => void;
  /** A crisp double-tap that says "yes, confirmed". */
  confirm: () => void;
  /** A soft buzz that says "no, rejected". */
  reject: () => void;
  /** A light tick when a gesture begins. */
  gestureStart: () => void;
  /** A slightly heavier tick when a gesture completes. */
  gestureEnd: () => void;
  /** A very light tick for segment control changes. */
  segmentTick: () => void;
  /** A warm, rising pattern for toggle on. */
  toggleOn: () => void;
  /** A cool, falling pattern for toggle off. */
  toggleOff: () => void;
  /** A light tick for stepper increment. */
  increment: () => void;
  /** A light tick for stepper decrement. */
  decrement: () => void;
  /** A playful pattern for major success (offer accepted, payment completed). */
  successCelebration: () => void;
  /** A rapid triple-buzz for errors. */
  errorShake: () => void;
}
