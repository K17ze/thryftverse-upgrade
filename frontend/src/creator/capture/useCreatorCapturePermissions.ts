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

import { useCallback, useEffect, useState } from 'react';
import {
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';

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
 * Camera permission is requested on mount (the camera is the root
 * creator state — the user sees the viewfinder immediately).
 *
 * Microphone permission is NOT requested on mount. It is requested
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
  } = useMicrophonePermission();

  const [micState, setMicState] = useState<MicPermissionState>(
    hasMic ? 'granted' : 'denied',
  );
  // Track whether we've attempted a mic permission request this session.
  // We don't auto-request mic on mount — only when the user initiates video.
  const [micRequested, setMicRequested] = useState(false);

  // Sync micState when the underlying permission changes (e.g. after
  // returning from Settings).
  useEffect(() => {
    setMicState(hasMic ? 'granted' : (micRequested ? 'blocked' : 'denied'));
  }, [hasMic, micRequested]);

  const requestCamera = useCallback(async () => {
    const granted = await reqCamera();
    return granted;
  }, [reqCamera]);

  const requestMic = useCallback(async () => {
    setMicRequested(true);
    const granted = await reqMic();
    if (granted) {
      setMicState('granted');
    } else {
      // After a denial, check if we can still ask again. VisionCamera
      // doesn't expose canRequestPermission for mic directly, but if
      // the request returns false on iOS, it means permanently denied.
      setMicState('blocked');
    }
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
