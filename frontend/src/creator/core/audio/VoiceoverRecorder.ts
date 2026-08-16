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
  private _startTime = 0;

  /** Whether a recording is currently in progress. */
  get isRecording(): boolean {
    return this._isRecording;
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
    this._startTime = Date.now();
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

    const durationMs = Date.now() - this._startTime;
    this._isRecording = false;

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
      return;
    }

    if (this._isRecording) {
      // When expo-audio is available:
      //   await this._recorder.stop();
      //   // Delete the temp file
      this._isRecording = false;
    }
  }
}
