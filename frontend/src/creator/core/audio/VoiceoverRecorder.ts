/**
 * VoiceoverRecorder — voiceover recording for the creator editor.
 *
 * Per spec 09_POSTER_TIMELINE_CAMERA_AUDIO §10 (P1: voiceover).
 *
 * Native dependency: expo-audio (SDK 57).
 *   import { AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';
 *   await AudioModule.requestRecordingPermissionsAsync();
 *   await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
 *   recorder.record();
 *   // ...
 *   await recorder.stop();
 *   const uri = recorder.uri;
 *
 * This class uses the imperative expo-audio API (AudioModule.AudioRecorder)
 * rather than the useAudioRecorder hook, because it is a plain class
 * instance managed via useRef in VoiceoverRecorderSheet — not a React
 * component that can call hooks. The recorder is created lazily on first
 * recording and released in dispose().
 *
 * Metering (expo-audio AudioRecorder):
 *   const status = recorder.getStatus();
 *   // status.metering: -160..0 dBFS → normalize to 0..1
 *   const level = Math.pow(10, status.metering / 20); // 0..1
 */

import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';

// ── Types ────────────────────────────────────────────────────────────

export type VoiceoverClip = {
  /** Unique clip ID. */
  id: string;
  /** Local file URI of the recorded audio. */
  uri: string;
  /** Duration of the recording in milliseconds. */
  durationMs: number;
  /** Timestamp when the recording was made. */
  recordedAt: number;
};

/**
 * Callback invoked periodically during recording with the current
 * input level (0..1, normalized from dBFS metering). Used by the UI
 * to render a live waveform visualization.
 */
export type MeteringListener = (level: number) => void;

// ── Error ────────────────────────────────────────────────────────────

/**
 * Error thrown when voiceover recording is attempted without the required
 * native dependency. With expo-audio installed this is only thrown when
 * the native module fails to link (e.g., running in Expo Go without a
 * development build).
 */
export class VoiceoverDependencyError extends Error {
  constructor() {
    super(
      'Voiceover recording requires expo-audio to be installed and linked. ' +
        'Ensure "expo-audio" is in package.json and rebuild the native app ' +
        'with a development build to enable this feature.',
    );
    this.name = 'VoiceoverDependencyError';
  }
}

// ── Recording options ────────────────────────────────────────────────

/**
 * High-quality recording preset with metering enabled for live waveform
 * visualization. expo-audio saves to the app's cache directory by default.
 */
const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

// ── Recorder ─────────────────────────────────────────────────────────

/**
 * VoiceoverRecorder — records voiceover audio from the device microphone.
 *
 * Lifecycle:
 *   const recorder = new VoiceoverRecorder();
 *   await recorder.startRecording();  // microphone active
 *   // ... user speaks ...
 *   const clip = await recorder.stopRecording();  // returns VoiceoverClip
 *   // or:
 *   await recorder.cancelRecording();  // discards the recording
 *   recorder.dispose();  // release native resources when done
 *
 * The recorder tracks internal state to prevent invalid transitions.
 */
export class VoiceoverRecorder {
  private _isRecording = false;
  private _isPaused = false;
  private _startTime = 0;
  private _accumulatedMs = 0;
  private _meteringListeners = new Set<MeteringListener>();
  private _meteringInterval: ReturnType<typeof setInterval> | null = null;
  private _recorder: AudioRecorder | null = null;

  /** Whether a recording is currently in progress (not paused). */
  get isRecording(): boolean {
    return this._isRecording && !this._isPaused;
  }

  /** Whether recording is currently paused. */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Elapsed recording time in milliseconds (excluding paused intervals).
   */
  get elapsedMs(): number {
    if (!this._isRecording) return this._accumulatedMs;
    if (this._isPaused) return this._accumulatedMs;
    return this._accumulatedMs + (Date.now() - this._startTime);
  }

  /**
   * Check whether the required native dependency is available.
   * Returns true when expo-audio is installed and the native module is
   * linked. Returns false when running in an environment without the
   * native module (e.g., Expo Go without a development build).
   *
   * The UI should call this before showing the record button and present
   * an honest disabled state when it returns false (AGENTS.md §11).
   */
  static isAvailable(): boolean {
    try {
      return AudioModule?.AudioRecorder != null;
    } catch {
      return false;
    }
  }

  /**
   * Subscribe to live metering (input level) updates during recording.
   * The listener receives a 0..1 normalized amplitude. Returns an
   * unsubscribe function. When the native dependency is unavailable, no
   * updates are emitted — the UI should treat the absence of updates as
   * "metering not available" and label it honestly (AGENTS.md §11).
   */
  setMeteringListener(listener: MeteringListener): () => void {
    this._meteringListeners.add(listener);
    return () => {
      this._meteringListeners.delete(listener);
    };
  }

  /**
   * Request microphone recording permission.
   * Throws VoiceoverDependencyError when the native module is not available.
   */
  async requestPermission(): Promise<boolean> {
    if (!VoiceoverRecorder.isAvailable()) {
      throw new VoiceoverDependencyError();
    }
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    return granted;
  }

  /**
   * Start recording from the device microphone.
   * Throws VoiceoverDependencyError when the native module is not available.
   * Throws if a recording is already in progress.
   */
  async startRecording(): Promise<void> {
    if (!VoiceoverRecorder.isAvailable()) {
      throw new VoiceoverDependencyError();
    }
    if (this._isRecording) {
      throw new Error('Recording is already in progress.');
    }

    // Configure the audio session for recording.
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      interruptionMode: 'doNotMix',
    });

    // Create the native recorder lazily if this is the first recording.
    if (!this._recorder) {
      this._recorder = new AudioModule.AudioRecorder({});
    }

    // Prepare the recorder with high-quality options + metering.
    await this._recorder.prepareToRecordAsync(RECORDING_OPTIONS);
    this._recorder.record();

    this._isRecording = true;
    this._isPaused = false;
    this._accumulatedMs = 0;
    this._startTime = Date.now();
    this._startMeteringPolling();
  }

  /**
   * Pause the current recording. The microphone is muted and the elapsed
   * time accumulator is frozen. Safe to call when already paused.
   */
  async pauseRecording(): Promise<void> {
    if (!this._isRecording || this._isPaused) return;
    this._recorder?.pause();
    this._accumulatedMs += Date.now() - this._startTime;
    this._isPaused = true;
    this._stopMeteringPolling();
  }

  /**
   * Resume a paused recording.
   */
  async resumeRecording(): Promise<void> {
    if (!this._isRecording || !this._isPaused) return;
    this._recorder?.record();
    this._isPaused = false;
    this._startTime = Date.now();
    this._startMeteringPolling();
  }

  /**
   * Stop recording and return the recorded clip.
   * Throws VoiceoverDependencyError when the native module is not available.
   * Throws if no recording is in progress.
   */
  async stopRecording(): Promise<VoiceoverClip> {
    if (!VoiceoverRecorder.isAvailable()) {
      throw new VoiceoverDependencyError();
    }
    if (!this._isRecording) {
      throw new Error('No recording is in progress.');
    }

    // Stop the native recorder and capture the URI.
    await this._recorder?.stop();

    if (!this._isPaused) {
      this._accumulatedMs += Date.now() - this._startTime;
    }
    const durationMs = this._accumulatedMs;
    this._stopMeteringPolling();
    this._isRecording = false;
    this._isPaused = false;
    this._accumulatedMs = 0;

    const uri = this._recorder?.uri ?? '';

    const clip: VoiceoverClip = {
      id: `voiceover_${Date.now()}`,
      uri,
      durationMs,
      recordedAt: Date.now(),
    };

    return clip;
  }

  /**
   * Cancel the current recording and discard the audio.
   * Safe to call even if no recording is in progress.
   */
  async cancelRecording(): Promise<void> {
    if (!VoiceoverRecorder.isAvailable()) {
      // No recording to cancel — this is a no-op when the dependency
      // is missing, not an error.
      this._isRecording = false;
      this._isPaused = false;
      this._accumulatedMs = 0;
      this._stopMeteringPolling();
      return;
    }

    if (this._isRecording) {
      await this._recorder?.stop().catch(() => {
        // Stopping a cancelled recording may reject if the recorder
        // was never fully prepared — ignore.
      });
      this._isRecording = false;
      this._isPaused = false;
      this._accumulatedMs = 0;
      this._stopMeteringPolling();
    }
  }

  /**
   * Release the native recorder and free resources.
   * Call this when the VoiceoverRecorder is no longer needed (e.g.,
   * when the hosting component unmounts). Safe to call multiple times.
   */
  dispose(): void {
    this._stopMeteringPolling();
    if (this._recorder) {
      this._recorder.release();
      this._recorder = null;
    }
    this._isRecording = false;
    this._isPaused = false;
    this._accumulatedMs = 0;
  }

  // ── Metering polling ────────────────────────────────────────────────

  /**
   * Start polling the recorder for metering levels and emitting them to
   * subscribers. When the native dependency is unavailable this is a no-op
   * (no updates are emitted), which the UI handles honestly.
   */
  private _startMeteringPolling(): void {
    this._stopMeteringPolling();
    if (!VoiceoverRecorder.isAvailable()) return;

    this._meteringInterval = setInterval(() => {
      if (!this._recorder) return;
      const status = this._recorder.getStatus();
      if (status.isRecording && status.metering != null) {
        // metering is -160..0 dBFS → normalize to 0..1
        const level = Math.pow(10, status.metering / 20);
        this._emitMetering(Math.max(0, Math.min(1, level)));
      }
    }, 60);
  }

  private _stopMeteringPolling(): void {
    if (this._meteringInterval !== null) {
      clearInterval(this._meteringInterval);
      this._meteringInterval = null;
    }
  }

  private _emitMetering(level: number): void {
    this._meteringListeners.forEach((cb) => {
      try {
        cb(level);
      } catch {
        // Listener errors must not crash the recording loop.
      }
    });
  }
}
