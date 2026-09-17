// ── Capture tuning constants ─────────────────────────────────────────
// Shared between CreatorCamera and its extracted capture hooks
// (useCameraRecording, useCaptureGestures, useCameraReview).

export const RECORDING_MAX_DURATION = 15000; // 15s max for video

// Swipe-down-to-dismiss is a top-strip gesture only. Touches beginning
// below this height (relative to the viewfinder root) belong to capture
// grammar — focus taps, shutter hold-drag, staging tray — never dismissal.
export const DISMISS_ZONE_HEIGHT = 120; // pt from the top edge

// ── Hands-free capture ──
// 3-second countdown, then recording begins automatically and stops at
// HANDS_FREE_DEFAULT_DURATION. The user can tap to stop early.
export const HANDS_FREE_COUNTDOWN = 3; // seconds
export const HANDS_FREE_DEFAULT_DURATION = 10000; // 10s default
export const HANDS_FREE_MAX_DURATION = 30000; // 30s max

// ── Capture speed modes ──
// vision-camera supports native fps control via the video output's
// recording options. The selected speed multiplier is stored in the clip
// metadata (CreatorInitialMedia.speed) so the timeline/export engine
// can apply it at playback, and the native recording fps is adjusted
// for true slow-motion (high fps) or fast-motion (low fps).
export const DEFAULT_SPEED = '1';
