/**
 * CaptionService — speech-to-text and manual caption management for the
 * ThryftVerse creator editor.
 *
 * Per spec 06_TEXT_TYPOGRAPHY_EDITORIAL_SYSTEM §6 and AGENTS.md §11
 * (truthful UI):
 *
 *  Auto captions (speech-to-text):
 *    Auto transcription requires a native speech recognition module.
 *    As of this build, no STT module is present in package.json
 *    (expo-speech-recognition, expo-sherpa-onnx, expo-ai-kit, etc. are
 *    all absent). Therefore `isAvailable()` returns false and
 *    `transcribe()` rejects with a truthful 'unsupported' status.
 *
 *    When a STT module is added to the project, wire it here:
 *      Option A: expo-speech-recognition (iOS SFSpeechRecognizer /
 *                Android SpeechRecognizer / Web SpeechRecognition)
 *      Option B: expo-sherpa-onnx (fully offline on-device Whisper/
 *                SenseVoice/Paraformer via sherpa-onnx)
 *      Option C: expo-ai-kit (Apple Foundation Models / ML Kit on-device)
 *      Option D: a backend transcription API (Whisper, ElevenLabs, etc.)
 *
 *    The architecture below is ready for any of these — just implement
 *    the `transcribe` method body and flip `isAvailable()` to true.
 *
 *  Manual captions:
 *    Fully functional. The user can type text, set start/end timing,
 *    edit existing segments, adjust timing, and delete segments.
 *    No fabrication — every segment is real user-authored content.
 */
import { createStableId } from '../../../utils/createStableId';
import type { CaptionSegment, CaptionTrack } from './CaptionTypes';

// ── STT module availability check ────────────────────────────────────
//
// We check at module load time whether a speech recognition module is
// importable. This is done via a try/catch require so the app never
// crashes if the module is absent (the normal case today).
//
// Per AGENTS.md §24.2, we do NOT crawl node_modules — we only attempt
// a top-level require of the known package names. If the package is not
// installed, require throws and we catch it.

let sttModuleAvailable = false;
let sttModuleName: string | null = null;

// Check for expo-speech-recognition
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('expo-speech-recognition');
  sttModuleAvailable = true;
  sttModuleName = 'expo-speech-recognition';
} catch {
  // Not installed — try the next option.
}

// Check for expo-sherpa-onnx (offline on-device STT)
if (!sttModuleAvailable) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('expo-sherpa-onnx');
    sttModuleAvailable = true;
    sttModuleName = 'expo-sherpa-onnx';
  } catch {
    // Not installed.
  }
}

// Check for expo-ai-kit (Apple Foundation Models / ML Kit)
if (!sttModuleAvailable) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('expo-ai-kit');
    sttModuleAvailable = true;
    sttModuleName = 'expo-ai-kit';
  } catch {
    // Not installed.
  }
}

/**
 * The error thrown when auto-transcription is attempted but no STT
 * module is available. The UI uses this to show a truthful message.
 */
export class CaptionUnsupportedError extends Error {
  constructor() {
    super(
      'Auto captions require a speech recognition module. ' +
        'No speech-to-text module is installed in this build. ' +
        'You can add captions manually.',
    );
    this.name = 'CaptionUnsupportedError';
  }
}

/**
 * The error thrown when auto-transcription fails for a reason other
 * than missing module (e.g. permission denied, file unreadable).
 */
export class CaptionTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptionTranscriptionError';
  }
}

// ── Service ──────────────────────────────────────────────────────────

export class CaptionService {
  /**
   * Check if speech-to-text is available on this device.
   *
   * Returns false when no STT native module is installed (the current
   * state of this build). Returns true once a STT module is added to
   * package.json and wired into the `transcribe` method.
   */
  isAvailable(): boolean {
    return sttModuleAvailable;
  }

  /**
   * The name of the detected STT module, if any. Used for diagnostics
   * and truthful UI messaging.
   */
  getModuleName(): string | null {
    return sttModuleName;
  }

  /**
   * Transcribe audio from a video/audio file into a caption track.
   *
   * If no native STT module is available, this rejects with a
   * `CaptionUnsupportedError` — a truthful 'unsupported' status. The
   * UI must present an honest message and offer manual caption entry.
   *
   * When a STT module is added, implement the transcription here:
   *   1. Read the audio from `mediaUri` (extract audio track from video
   *      if needed via expo-video or expo-av).
   *   2. Send to the STT engine (on-device or backend API).
   *   3. Parse the result into CaptionSegments with start/end timing.
   *   4. If word-level timestamps are available, populate `words`.
   *   5. Return a CaptionTrack with source='auto'.
   *
   * @param mediaUri  URI of the media file (video or audio) to transcribe.
   * @param language  BCP-47 language tag (e.g. 'en-US'). Defaults to 'en'.
   * @returns A CaptionTrack with auto-generated segments.
   * @throws {CaptionUnsupportedError} when no STT module is installed.
   * @throws {CaptionTranscriptionError} when transcription fails.
   */
  async transcribe(mediaUri: string, language: string = 'en'): Promise<CaptionTrack> {
    void mediaUri;
    void language;

    if (!sttModuleAvailable) {
      throw new CaptionUnsupportedError();
    }

    // ── STT module wiring placeholder ────────────────────────────────
    // When a STT module is added to package.json, implement the real
    // transcription pipeline here. The architecture is ready:
    //
    // if (sttModuleName === 'expo-speech-recognition') {
    //   // Use ExpoSpeechRecognitionModule.start() with the audio file
    //   // and collect results via the onResult callback.
    // } else if (sttModuleName === 'expo-sherpa-onnx') {
    //   // Use createSTT() with a Whisper/SenseVoice model and
    //   // transcribe the WAV file extracted from the media.
    // } else if (sttModuleName === 'expo-ai-kit') {
    //   // Use the on-device speech-to-text provider.
    // } else {
    //   // Option D: send to a backend transcription API.
    // }
    //
    // For now, this path is unreachable because isAvailable() is false.
    // We throw a truthful error to guard against any future code path
    // that reaches here before the wiring is complete.
    throw new CaptionTranscriptionError(
      'Speech-to-text module detected but transcription pipeline is not yet wired.',
    );
  }

  /**
   * Create a manual caption segment. The user types text and sets
   * timing. This is fully functional — no fabrication.
   *
   * @param text     The caption text.
   * @param startMs  Start time in milliseconds.
   * @param endMs    End time in milliseconds.
   * @returns A new CaptionSegment with a stable ID.
   */
  createManualCaption(text: string, startMs: number, endMs: number): CaptionSegment {
    const clampedStart = Math.max(0, startMs);
    const clampedEnd = Math.max(clampedStart + 100, endMs);
    return {
      id: createStableId('caption'),
      text: text.trim(),
      startMs: clampedStart,
      endMs: clampedEnd,
    };
  }

  /**
   * Create a new caption track from a list of segments.
   *
   * @param segments  The caption segments (ordered by start time).
   * @param language  BCP-47 language tag.
   * @param source    Whether the track is auto or manual.
   * @returns A new CaptionTrack.
   */
  createTrack(
    segments: CaptionSegment[],
    language: string = 'en',
    source: 'auto' | 'manual' = 'manual',
  ): CaptionTrack {
    // Sort segments by start time to ensure correct playback order.
    const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
    return {
      id: createStableId('captiontrack'),
      segments: sorted,
      language,
      source,
    };
  }

  /**
   * Edit the text of an existing caption segment.
   *
   * @param track      The caption track to mutate.
   * @param segmentId  The ID of the segment to edit.
   * @param text       The new text.
   * @returns A new CaptionTrack with the edited segment.
   */
  editCaption(track: CaptionTrack, segmentId: string, text: string): CaptionTrack {
    return {
      ...track,
      segments: track.segments.map((seg) =>
        seg.id === segmentId ? { ...seg, text: text.trim() } : seg,
      ),
    };
  }

  /**
   * Adjust the timing of an existing caption segment.
   *
   * @param track      The caption track to mutate.
   * @param segmentId  The ID of the segment to adjust.
   * @param startMs    The new start time.
   * @param endMs      The new end time.
   * @returns A new CaptionTrack with the adjusted segment.
   */
  adjustTiming(
    track: CaptionTrack,
    segmentId: string,
    startMs: number,
    endMs: number,
  ): CaptionTrack {
    const clampedStart = Math.max(0, startMs);
    const clampedEnd = Math.max(clampedStart + 100, endMs);
    return {
      ...track,
      segments: track.segments.map((seg) =>
        seg.id === segmentId
          ? { ...seg, startMs: clampedStart, endMs: clampedEnd }
          : seg,
      ),
    };
  }

  /**
   * Delete a caption segment from a track.
   *
   * @param track      The caption track to mutate.
   * @param segmentId  The ID of the segment to delete.
   * @returns A new CaptionTrack without the deleted segment.
   */
  deleteCaption(track: CaptionTrack, segmentId: string): CaptionTrack {
    return {
      ...track,
      segments: track.segments.filter((seg) => seg.id !== segmentId),
    };
  }

  /**
   * Add a segment to a track, keeping segments sorted by start time.
   *
   * @param track    The caption track to mutate.
   * @param segment  The segment to add.
   * @returns A new CaptionTrack with the added segment.
   */
  addSegment(track: CaptionTrack, segment: CaptionSegment): CaptionTrack {
    const segments = [...track.segments, segment].sort(
      (a, b) => a.startMs - b.startMs,
    );
    return { ...track, segments };
  }
}

/**
 * Singleton instance of the caption service.
 */
export const captionService = new CaptionService();
