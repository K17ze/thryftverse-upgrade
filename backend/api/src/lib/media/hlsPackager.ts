/**
 * HLS / CMAF packaging — builds the FFmpeg argument vector for a 5-rendition
 * H.264 ABR ladder with fMP4 (CMAF) segments.
 *
 * The ladder covers 240p / 360p / 480p / 720p / 1080p with bitrate targets
 * tuned for general-purpose streaming. Segments are 6 seconds long with
 * closed-GOP keyframes aligned to segment boundaries, enabling seamless
 * rendition switching at segment edges.
 *
 * The output is a single FFmpeg invocation producing one master playlist
 * (`master.m3u8`) and per-rendition playlists + segment files under the
 * supplied output directory. The caller is responsible for uploading the
 * resulting files to S3.
 *
 * @packageDocumentation
 */

interface HlsRendition {
  name: string;
  width: number;
  height: number;
  videoBitrate: string;
  maxRate: string;
  bufSize: string;
  audioBitrate: string;
}

const RENDITIONS: readonly HlsRendition[] = [
  { name: '240p', width: 426, height: 240, videoBitrate: '400k', maxRate: '435k', bufSize: '600k', audioBitrate: '64k' },
  { name: '360p', width: 640, height: 360, videoBitrate: '800k', maxRate: '856k', bufSize: '1200k', audioBitrate: '96k' },
  { name: '480p', width: 854, height: 480, videoBitrate: '1400k', maxRate: '1493k', bufSize: '2100k', audioBitrate: '128k' },
  { name: '720p', width: 1280, height: 720, videoBitrate: '2800k', maxRate: '2996k', bufSize: '4200k', audioBitrate: '128k' },
  { name: '1080p', width: 1920, height: 1080, videoBitrate: '5000k', maxRate: '5350k', bufSize: '7500k', audioBitrate: '192k' },
];

const SEGMENT_DURATION_SECONDS = 6;
const KEYFRAME_INTERVAL = SEGMENT_DURATION_SECONDS * 30; // 30fps assumption

/**
 * Builds the FFmpeg argument vector for transcoding `inputPath` into a
 * 5-rendition HLS/CMAF ABR ladder written under `outputDir`.
 *
 * The output directory must exist before invocation. The master playlist is
 * written to `<outputDir>/master.m3u8` and each rendition has its own
 * sub-playlist and fMP4 segments.
 */
export function buildHlsArgs(inputPath: string, outputDir: string): string[] {
  const args: string[] = [
    '-y',
    '-i', inputPath,
    // Ensure the input is decoded once and reused across all renditions.
    '-threads', '0',
    // Strip all container/stream metadata (EXIF, GPS, encoder tags, custom
    // tags) from the HLS outputs to protect uploader privacy.
    '-map_metadata', '-1',
  ];

  // Per-rendition video filter chains and output mappings.
  for (const rendition of RENDITIONS) {
    args.push(
      '-filter_complex',
      `[0:v]scale=w=${rendition.width}:h=${rendition.height}:force_original_aspect_ratio=decrease,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v_${rendition.name}]`,
    );
  }

  // Map each rendition's filtered video stream.
  for (const rendition of RENDITIONS) {
    args.push('-map', `[v_${rendition.name}]`);
  }

  // Map the audio stream once per rendition so each playlist is self-contained.
  for (const rendition of RENDITIONS) {
    args.push('-map', '0:a');
  }

  // Per-stream encoding parameters. Stream order is v_240p, v_360p, ...,
  // followed by a_240p, a_360p, ... — but FFmpeg applies -var_stream_map
  // grouping so we set codecs and bitrates per-stream by index.
  let streamIndex = 0;
  for (const rendition of RENDITIONS) {
    args.push(
      `-c:v:${streamIndex}`, 'libx264',
      `-x264-params:v:${streamIndex}`,
      `keyint=${KEYFRAME_INTERVAL}:min-keyint=${KEYFRAME_INTERVAL}:scenecut=0:closed-coder=1`,
      `-b:v:${streamIndex}`, rendition.videoBitrate,
      `-maxrate:v:${streamIndex}`, rendition.maxRate,
      `-bufsize:v:${streamIndex}`, rendition.bufSize,
      `-vf:v:${streamIndex}`, `scale=${rendition.width}:${rendition.height}`,
    );
    streamIndex += 1;
  }

  // Audio encoding — AAC for all renditions.
  for (let audioIndex = 0; audioIndex < RENDITIONS.length; audioIndex += 1) {
    const rendition = RENDITIONS[audioIndex];
    args.push(
      `-c:a:${audioIndex}`, 'aac',
      `-b:a:${audioIndex}`, rendition.audioBitrate,
      `-ac:${audioIndex}`, '2',
    );
  }

  // fMP4 (CMAF) segment muxer settings.
  args.push(
    '-f', 'hls',
    '-hls_time', String(SEGMENT_DURATION_SECONDS),
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4',
    '-hls_flags', 'independent_segments+program_date_time',
    '-hls_segment_filename', `${outputDir}/stream_%v/seg_%05d.m4s`,
    '-master_pl_name', 'master.m3u8',
  );

  // Per-rendition variant stream mapping.
  const varStreamMap = RENDITIONS.map((rendition, index) => {
    return `v:${index},a:${index}`;
  }).join(' ');
  args.push('-var_stream_map', varStreamMap);

  args.push(`${outputDir}/stream_%v/playlist.m3u8`);

  return args;
}

export { RENDITIONS as HLS_RENDITIONS, SEGMENT_DURATION_SECONDS as HLS_SEGMENT_DURATION_SECONDS };
