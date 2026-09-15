// ── Creator Capture Permissions ─────────────────────────────────────
// Owns camera + microphone permission state for the creator camera.
//
// VisionCamera v5 requires microphone permission when `enableAudio: true`
// is passed to `useVideoOutput`. The camera permission and microphone
// permission are independent — a user can grant camera but deny mic.
//
// Critical Android constraint: do NOT request camera and microphone
// permissions in parallel. Android's `Activity.requestPermissions()`
// refuses concurrent requests — the second request is cancelled with
// empty arrays, which gets persisted as permanently denied. Request
// them sequentially: camera first, microphone second.
//
// (AGENTS.md §4.2 — microphone permission ownership)

import { useCallback } from 'react';
import {
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';

// 'denied' is a *re-askable* state (native 'not-determined': never asked,
// or Android soft-denial without "don't ask again"). 'blocked' is the
// permanent state (native 'denied'/'restricted') that requires Settings.
export type MicPermissionState = 'granted' | 'denied' | 'blocked';

export interface CreatorCapturePermissions {
  /** Camera permission granted. */
  cameraGranted: boolean;
  /** Camera permission can still be requested (not permanently denied). */
  canRequestCamera: boolean;
  /** Request camera permission. */
  requestCamera: () => Promise<boolean>;

  /** Microphone permission state. */
  micState: MicPermissionState;
  /** Microphone permission granted (convenience for `micState === 'granted'`). */
  micGranted: boolean;
  /** Request microphone permission. Safe to call after camera is granted. */
  requestMic: () => Promise<boolean>;

  /** True when video recording should include audio. */
  shouldRecordAudio: boolean;
}

/**
 * Owns camera + microphone permission state for the creator camera.
 *
 * Camera permission is NOT requested on mount — the hook exposes
 * `requestCamera` for the caller to invoke explicitly on the user's
 * first interaction with the camera surface. This matches Design.md's
 * permission privacy principle: never request a permission before the
 * user has expressed intent that requires it.
 *
 * Microphone permission is also NOT requested on mount. It is requested
 * lazily — only when the user first transitions from shutter press to
 * video intent. Camera is a blocking gate; microphone is non-blocking
 * with graceful degradation to muted recording (Instagram/Snapchat
 * pattern: the user never loses the viewfinder over a mic prompt).
 */
export function useCreatorCapturePermissions(): CreatorCapturePermissions {
  const {
    hasPermission: hasCamera,
    requestPermission: reqCamera,
    canRequestPermission: canReqCamera,
  } = useCameraPermission();

  const {
    hasPermission: hasMic,
    requestPermission: reqMic,
    status: micStatus,
  } = useMicrophonePermission();

  // Derive micState from the platform permission status instead of
  // session bookkeeping. The previous implementation set 'blocked' after
  // any single denial — a soft Android denial (re-askable) was conflated
  // with a permanent denial, so a "not now" answer disabled re-asking for
  // the rest of the session. The native status is also the source of truth
  // for grants made in Settings while the app was backgrounded.
  const micState: MicPermissionState = hasMic
    ? 'granted'
    : micStatus === 'not-determined' ? 'denied' : 'blocked';

  const requestCamera = useCallback(async () => {
    const granted = await reqCamera();
    return granted;
  }, [reqCamera]);

  const requestMic = useCallback(async () => {
    // The platform only shows a dialog while status is 'not-determined';
    // a permanently denied mic resolves false immediately.
    const granted = await reqMic();
    return granted;
  }, [reqMic]);

  return {
    cameraGranted: hasCamera,
    canRequestCamera: canReqCamera,
    requestCamera,
    micState,
    micGranted: micState === 'granted',
    requestMic,
    // Only record audio when mic permission is explicitly granted.
    // If mic is denied or blocked, record muted video.
    shouldRecordAudio: micState === 'granted',
  };
}
