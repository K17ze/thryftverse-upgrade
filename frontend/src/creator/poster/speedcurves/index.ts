// Barrel export for the Poster speed curves module.
// Variable speed ramping along a customizable curve (Instagram Edits parity).

export type {
  SpeedPoint,
  SpeedCurveEasing,
  SpeedCurve,
} from './SpeedCurveTypes';

export {
  SPEED_MIN,
  SPEED_MAX,
  FREEZE_SPEED,
  SPEED_CURVE_PRESETS,
  DEFAULT_SPEED_CURVE,
  clampSpeed,
  clampPosition,
  sampleSpeedAtPosition,
  averageSpeed,
} from './SpeedCurveTypes';

export { SpeedCurveEditor } from './SpeedCurveEditor';
export type { SpeedCurveEditorProps } from './SpeedCurveEditor';
