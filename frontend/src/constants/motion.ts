/**
 * @deprecated Use `theme/motionTokens.ts` (Motion) directly.
 * This file is a compatibility shim that re-exports Motion values
 * under the legacy naming convention. Do not add new configs here.
 *
 * Legacy → Canonical mapping:
 *   spring.pressRelease  → Motion.spring.press
 *   spring.flagship      → Motion.spring.entrance
 *   spring.flagshipPop   → Motion.spring.lift
 *   timing.pressIn       → Motion.duration.fast (120ms)
 *   timing.pressOut      → Motion.duration.fast (120ms)
 *   timing.focus         → Motion.duration.normal (180ms)
 *   list.enterDuration   → Motion.duration.slow (280ms)
 *   list.staggerStep     → Motion.stagger.normal (60ms)
 *   list.maxStaggerItems → 10 (no canonical equivalent)
 *   navigation.pushOpenDuration   → Motion.duration.normal (180ms)
 *   navigation.pushCloseDuration  → Motion.duration.fast (120ms)
 *   navigation.modalOpenDuration  → Motion.duration.normal (180ms)
 *   navigation.modalCloseDuration → Motion.duration.normal (180ms)
 */
import { Motion as MotionTokens } from '../theme/motionTokens';

export const Motion = {
  spring: {
    pressRelease: MotionTokens.spring.press,
    flagship: MotionTokens.spring.entrance,
    flagshipPop: MotionTokens.spring.lift,
  },
  timing: {
    pressIn: MotionTokens.duration.fast,
    pressOut: MotionTokens.duration.fast,
    focus: MotionTokens.duration.normal,
  },
  list: {
    enterDuration: MotionTokens.duration.slow,
    staggerStep: MotionTokens.stagger.normal,
    maxStaggerItems: 10,
  },
  navigation: {
    pushOpenDuration: MotionTokens.duration.normal,
    pushCloseDuration: MotionTokens.duration.fast,
    modalOpenDuration: MotionTokens.duration.normal,
    modalCloseDuration: MotionTokens.duration.normal,
  },
} as const;
