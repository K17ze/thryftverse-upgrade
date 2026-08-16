/**
 * WaveformExtractor — real audio waveform extraction for the creator editor.
 *
 * Per spec 09_POSTER_TIMELINE_CAMERA_AUDIO §10 (P1: real waveform extraction).
 *
 * Strategy:
 *  - For WAV files: parse the RIFF/WAVE container, read PCM samples, and
 *    downsample to the requested number of bars using RMS per bar. This is
 *    a pure-JS implementation that uses expo-file-system to read the file
 *    as base64, then decodes the PCM data in JS. No native module required.
 *  - For non-WAV files (mp3, aac, m4a, etc.): return an honest flat
 *    fallback with a console.warn. We do NOT fabricate waveform data
 *    (AGENTS.md §11 — truthful UI). When a native waveform library
 *    (expo-audio-waveform, react-native-audio-data) is added to the
 *    project, this path can be upgraded to use it.
 *
 * Results are cached by URI + sample count to avoid re-reading the file
 * on every render.
 */
import * as FileSystem from 'expo-file-system';

// ── Types ────────────────────────────────────────────────────────────

export type WaveformData = {
  /** 0..1 normalized amplitudes (RMS per bar, normalized to peak). */
  samples: number[];
  /** Total audio duration in milliseconds. */
  durationMs: number;
  /** Sample rate of the source audio (Hz). */
  sampleRate: number;
};

// ── Cache ────────────────────────────────────────────────────────────

const waveformCache = new Map<string, WaveformData>();

function cacheKey(uri: string, samples: number): string {
  return `${uri}#${samples}`;
}

// ── WAV header parsing ───────────────────────────────────────────────

/**
 * Minimal RIFF/WAVE header structure.
 * We only need: sample rate, bits per sample, number of channels, and
 * the offset to the PCM data chunk.
 */
interface WavHeader {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
  dataOffset: number;
  dataLength: number;
}

/**
 * Parse a WAV file's RIFF header from a base64-encoded string.
 * Returns null if the file is not a valid WAV.
 */
function parseWavHeader(base64: string): WavHeader | null {
  // Decode the first ~128 bytes as binary to inspect the header.
  // RIFF header is 12 bytes; fmt chunk is at least 24 bytes; data chunk
  // follows. We read enough to find the data chunk offset.
  const headerBytes = base64ToBytes(base64, 0, 256);
  if (headerBytes.length < 44) return null;

  // RIFF signature: "RIFF"
  if (headerBytes[0] !== 0x52 || headerBytes[1] !== 0x49 ||
      headerBytes[2] !== 0x46 || headerBytes[3] !== 0x46) {
    return null;
  }

  // WAVE signature: "WAVE"
  if (headerBytes[8] !== 0x57 || headerBytes[9] !== 0x41 ||
      headerBytes[10] !== 0x56 || headerBytes[11] !== 0x45) {
    return null;
  }

  // Walk chunks to find "fmt " and "data"
  let offset = 12;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let channels = 1;
  let dataOffset = 0;
  let dataLength = 0;

  while (offset + 8 <= headerBytes.length) {
    const chunkId = String.fromCharCode(
      headerBytes[offset],
      headerBytes[offset + 1],
      headerBytes[offset + 2],
      headerBytes[offset + 3],
    );
    const chunkSize =
      headerBytes[offset + 4] |
      (headerBytes[offset + 5] << 8) |
      (headerBytes[offset + 6] << 16) |
      (headerBytes[offset + 7] << 24);

    if (chunkId === 'fmt ') {
      if (offset + 24 > headerBytes.length) break;
      // audioFormat (2 bytes), channels (2 bytes), sampleRate (4 bytes),
      // byteRate (4 bytes), blockAlign (2 bytes), bitsPerSample (2 bytes)
      channels =
        headerBytes[offset + 10] |
        (headerBytes[offset + 11] << 8);
      sampleRate =
        headerBytes[offset + 12] |
        (headerBytes[offset + 13] << 8) |
        (headerBytes[offset + 14] << 16) |
        (headerBytes[offset + 15] << 24);
      bitsPerSample =
        headerBytes[offset + 22] |
        (headerBytes[offset + 23] << 8);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break;
    }

    // Chunks are word-aligned (padded to even size)
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === 0) return null;

  return { sampleRate, bitsPerSample, channels, dataOffset, dataLength };
}

/**
 * Decode a slice of a base64 string into a Uint8Array.
 * base64 indices: each character = 6 bits, 4 chars = 3 bytes.
 */
function base64ToBytes(base64: string, byteOffset: number, byteLength: number): Uint8Array {
  const chars = base64.length;
  // Total decoded bytes = floor(chars * 3 / 4) minus padding
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const totalBytes = Math.floor(chars * 3 / 4) - padding;

  const endByte = Math.min(byteOffset + byteLength, totalBytes);
  const actualLength = Math.max(0, endByte - byteOffset);
  const result = new Uint8Array(actualLength);

  // Start char index for the byte offset
  const startChar = Math.floor(byteOffset / 3) * 4;
  const skipBytes = byteOffset % 3;

  // Decode from the base64 alphabet
  const decodeChar = (c: number): number => {
    if (c >= 65 && c <= 90) return c - 65;       // A-Z
    if (c >= 97 && c <= 122) return c - 97 + 26;  // a-z
    if (c >= 48 && c <= 57) return c - 48 + 52;   // 0-9
    if (c === 43) return 62;                       // +
    if (c === 47) return 63;                       // /
    return 0;
  };

  let outIdx = 0;
  let bytePos = 0;
  for (let i = startChar; i < chars && outIdx < actualLength; i += 4) {
    const v0 = decodeChar(base64.charCodeAt(i));
    const v1 = decodeChar(base64.charCodeAt(i + 1));
    const v2 = base64.charCodeAt(i + 2) === 61 ? 0 : decodeChar(base64.charCodeAt(i + 2));
    const v3 = base64.charCodeAt(i + 3) === 61 ? 0 : decodeChar(base64.charCodeAt(i + 3));

    const b0 = (v0 << 2) | (v1 >> 4);
    const b1 = ((v1 & 0x0f) << 4) | (v2 >> 2);
    const b2 = ((v2 & 0x03) << 6) | v3;

    const localBytes = [b0, b1, b2];
    for (let j = 0; j < 3 && outIdx < actualLength; j++) {
      const absByte = bytePos + j;
      if (absByte >= byteOffset && absByte < endByte) {
        result[outIdx++] = localBytes[j] & 0xff;
      }
    }
    bytePos += 3;
  }

  return result;
}

/**
 * Read PCM samples from the base64 data and compute RMS per bar.
 * Returns an array of 0..1 normalized amplitudes.
 */
function computeRmsBars(
  base64: string,
  header: WavHeader,
  numBars: number,
): number[] {
  const { bitsPerSample, channels, dataOffset, dataLength } = header;
  const bytesPerSample = bitsPerSample / 8;
  const bytesPerFrame = bytesPerSample * channels;
  const totalFrames = Math.floor(dataLength / bytesPerFrame);
  if (totalFrames <= 0 || numBars <= 0) return [];

  const framesPerBar = Math.max(1, Math.floor(totalFrames / numBars));
  const bars: number[] = [];

  // Read each bar's frames, compute RMS of the first channel
  for (let bar = 0; bar < numBars; bar++) {
    const startFrame = bar * framesPerBar;
    const endFrame = Math.min(startFrame + framesPerBar, totalFrames);
    if (startFrame >= endFrame) {
      bars.push(0);
      continue;
    }

    let sumSquares = 0;
    let count = 0;

    // Read frames for this bar
    const startByte = dataOffset + startFrame * bytesPerFrame;
    const endByte = dataOffset + endFrame * bytesPerFrame;
    const chunkSize = Math.min(endByte - startByte, 65536); // read in 64KB chunks

    for (let offset = startByte; offset < endByte; offset += chunkSize) {
      const readLen = Math.min(chunkSize, endByte - offset);
      const bytes = base64ToBytes(base64, offset, readLen);

      for (let i = 0; i + bytesPerSample <= bytes.length; i += bytesPerFrame) {
        let sample: number;
        if (bitsPerSample === 16) {
          // Signed 16-bit little-endian
          sample = bytes[i] | (bytes[i + 1] << 8);
          if (sample > 32767) sample -= 65536;
          sample /= 32768;
        } else if (bitsPerSample === 8) {
          // Unsigned 8-bit (0-255), center at 128
          sample = (bytes[i] - 128) / 128;
        } else if (bitsPerSample === 24) {
          // Signed 24-bit little-endian
          sample = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
          if (sample > 8388607) sample -= 16777216;
          sample /= 8388608;
        } else if (bitsPerSample === 32) {
          // Signed 32-bit little-endian (integer, not float)
          sample =
            bytes[i] |
            (bytes[i + 1] << 8) |
            (bytes[i + 2] << 16) |
            (bytes[i + 3] << 24);
          sample /= 2147483648;
        } else {
          // Unsupported bit depth — skip
          break;
        }
        sumSquares += sample * sample;
        count++;
      }
    }

    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    bars.push(rms);
  }

  // Normalize to 0..1 based on the peak bar
  const peak = Math.max(...bars, 0.0001);
  return bars.map((b) => Math.min(1, b / peak));
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Extract a waveform from an audio file URI.
 *
 * For WAV files, this performs real PCM parsing and RMS downsampling.
 * For non-WAV files, it returns an honest flat fallback (AGENTS.md §11).
 *
 * Results are cached by URI + sample count.
 *
 * @param audioUri  File URI (file:// or bare path) of the audio file.
 * @param samples   Number of waveform bars to extract (default 100).
 * @returns WaveformData with normalized 0..1 amplitudes.
 */
export async function extractWaveform(
  audioUri: string,
  samples: number = 100,
): Promise<WaveformData> {
  const key = cacheKey(audioUri, samples);
  const cached = waveformCache.get(key);
  if (cached) return cached;

  // Determine if this is a WAV file by extension
  const lowerUri = audioUri.toLowerCase();
  const isWav =
    lowerUri.endsWith('.wav') ||
    lowerUri.endsWith('.wave');

  if (!isWav) {
    // Honest fallback: non-WAV files cannot be decoded in pure JS.
    // When a native waveform library is added, upgrade this path.
    console.warn(
      `[WaveformExtractor] Non-WAV audio file cannot be decoded in JS. ` +
        `Returning flat fallback. URI: ${audioUri}`,
    );
    const fallback = flatWaveform(samples, 0);
    waveformCache.set(key, fallback);
    return fallback;
  }

  try {
    // Read the file as base64 via expo-file-system
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    if (!fileInfo.exists) {
      console.warn(
        `[WaveformExtractor] File does not exist: ${audioUri}`,
      );
      const fallback = flatWaveform(samples, 0);
      waveformCache.set(key, fallback);
      return fallback;
    }

    const base64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const header = parseWavHeader(base64);
    if (!header) {
      console.warn(
        `[WaveformExtractor] Invalid or unsupported WAV file: ${audioUri}`,
      );
      const fallback = flatWaveform(samples, 0);
      waveformCache.set(key, fallback);
      return fallback;
    }

    const bars = computeRmsBars(base64, header, samples);
    const durationMs =
      header.dataLength > 0 && header.sampleRate > 0
        ? (header.dataLength /
            (header.sampleRate * header.channels * (header.bitsPerSample / 8))) *
          1000
        : 0;

    const data: WaveformData = {
      samples: bars.length > 0 ? bars : flatBars(samples),
      durationMs,
      sampleRate: header.sampleRate,
    };

    waveformCache.set(key, data);
    return data;
  } catch (err) {
    console.warn(
      `[WaveformExtractor] Failed to extract waveform from ${audioUri}:`,
      err,
    );
    const fallback = flatWaveform(samples, 0);
    waveformCache.set(key, fallback);
    return fallback;
  }
}

/**
 * Clear the waveform cache for a specific URI, or all entries if no URI
 * is provided. Useful when a file is replaced or deleted.
 */
export function clearWaveformCache(audioUri?: string): void {
  if (audioUri) {
    for (const key of waveformCache.keys()) {
      if (key.startsWith(`${audioUri}#`)) {
        waveformCache.delete(key);
      }
    }
  } else {
    waveformCache.clear();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Generate a flat waveform (all zeros) — the honest fallback when
 * real extraction is not possible.
 */
function flatBars(samples: number): number[] {
  return new Array(samples).fill(0);
}

function flatWaveform(samples: number, durationMs: number): WaveformData {
  return {
    samples: flatBars(samples),
    durationMs,
    sampleRate: 0,
  };
}
