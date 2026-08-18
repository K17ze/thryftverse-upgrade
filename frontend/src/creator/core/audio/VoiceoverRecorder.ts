/**
 * VoiceoverRecorder — voiceover recording for the creator editor.
 *
 * Per spec 09_POSTER_TIMELINE_CAMERA_AUDIO §10 (P1: voiceover).
 *
 * DEPENDENCY NOTE (AGENTS.md §11 — truthful UI):
 * This project does NOT currently include `expo-av` or `expo-audio` in
 * package.json. The voiceover recording feature requires a native audio
 * recording module to function. This class provides the full API surface
 * so the UI can be built against it, but the actual recording methods
 * throw a truthful error explaining the missing dependency.
 *
 * When `expo-audio` (or `expo-av`) is added to the project, replace the
 * stub implementations in `startRecording` / `stopRecording` with the
 * real API calls. The `VoiceoverClip` type and the public method signatures
 * will remain stable — only the internal implementation changes.
 *
 * Migration guide (expo-audio, SDK 57):
 *   import { AudioModule, useAudioRecorder, RecordingPresets } from 'expo-audio';
 *   await AudioModule.requestRecordingPermissionsAsync();
 *   await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
 *   recorder.record();
 *   // ...
 *   await recorder.stop();
 *   const uri = recorder.uri;
 *
 * Metering (expo-av Audio.Recording):
 *   const status = await recording.getStatusAsync();
 *   // status.metering: -160..0 dBFS → normalize to 0..1
 *   const level = Math.pow(10, status.metering / 20); // 0..1
 */

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
 * native dependency. This is a truthful error — we do not fabricate a
 * recording or pretend the feature works.
 */
export class VoiceoverDependencyError extends Error {
  constructor() {
    super(
      'Voiceover recording requires expo-audio (or expo-av) to be installed. ' +
        'Add "expo-audio" to package.json and rebuild the native app to enable ' +
        'this feature.',
    );
    this.name = 'VoiceoverDependencyError';
  }
}

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
   * Returns false when expo-audio / expo-av is not installed.
   *
   * The UI should call this before showing the record button and present
   * an honest disabled state when it returns false (AGENTS.md §11).
   */
  static isAvailable(): boolean {
    // expo-audio and expo-av are not in package.json.
    // When one is added, attempt a dynamic import here and return true
    // if the module loads successfully.
    return false;
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
    // When expo-audio is available:
    //   const { status } = await AudioModule.requestRecordingPermissionsAsync();
    //   return status === 'granted';
    return false;
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

    // When expo-audio is available:
    //   await AudioModule.setAudioModeAsync({
    //     allowsRecordingIOS: true,
    //     playsInSilentModeIOS: true,
    //   });
    //   await this._recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
    //   this._recorder.record();

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
    // When expo-audio is available:
    //   await this._recorder.pause();
    this._accumulatedMs += Date.now() - this._startTime;
    this._isPaused = true;
    this._stopMeteringPolling();
  }

  /**
   * Resume a paused recording.
   */
  async resumeRecording(): Promise<void> {
    if (!this._isRecording || !this._isPaused) return;
    // When expo-audio is available:
    //   this._recorder.record();
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

    // When expo-audio is available:
    //   await this._recorder.stop();
    //   const uri = this._recorder.uri;
    //   const durationMs = (this._recorder.durationMs ?? 0) * 1000;

    if (!this._isPaused) {
      this._accumulatedMs += Date.now() - this._startTime;
    }
    const durationMs = this._accumulatedMs;
    this._stopMeteringPolling();
    this._isRecording = false;
    this._isPaused = false;
    this._accumulatedMs = 0;

    // This URI would come from the recorder. Since the dependency is not
    // available, we never reach this line in practice (the dependency error
    // is thrown above). The structure is here for the migration.
    const clip: VoiceoverClip = {
      id: `voiceover_${Date.now()}`,
      uri: '',
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
      // When expo-audio is available:
      //   await this._recorder.stop();
      //   // Delete the temp file
      this._isRecording = false;
      this._isPaused = false;
      this._accumulatedMs = 0;
      this._stopMeteringPolling();
    }
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

    // When expo-av is available:
    //   this._meteringInterval = setInterval(async () => {
    //     const status = await this._recorder.getStatusAsync();
    //     if (status.isRecording && status.metering != null) {
    //       // metering is -160..0 dBFS → normalize to 0..1
    //       const level = Math.pow(10, status.metering / 20);
    //       this._emitMetering(Math.max(0, Math.min(1, level)));
    //     }
    //   }, 60);
    this._meteringInterval = setInterval(() => {
      // Placeholder: real metering wired in the migration above.
      this._emitMetering(0);
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
