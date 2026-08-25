/**
 * Media asset manifest — the canonical JSON document describing every
 * derivative, ABR playlist, thumbnail and placeholder for a processed media
 * asset. The manifest is persisted to S3 alongside the derivatives and
 * referenced by the API so clients can resolve the optimal rendition without
 * re-probing the source.
 *
 * @packageDocumentation
 */

import type { MediaProbeResult } from './ffprobe.js';
import type { ImageDerivative } from './sharpPipeline.js';

export interface ManifestDerivative {
  variant: string;
  mediaKind: 'image' | 'video' | 'document';
  format: string;
  width: number | null;
  height: number | null;
  contentType: string;
  sizeBytes: number;
  canonicalUrl: string;
  objectKey: string;
}

export interface ManifestAbrRendition {
  name: string;
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
  playlistUrl: string;
}

export interface ManifestAbr {
  masterPlaylistUrl: string;
  renditions: ManifestAbrRendition[];
}

export interface ManifestThumbnail {
  timeSeconds: number;
  url: string;
}

export interface MediaAssetManifest {
  schemaVersion: 1;
  assetId: string;
  mediaKind: 'image' | 'video' | 'audio' | 'document';
  probe: {
    width: number | null;
    height: number | null;
    durationMs: number | null;
    codec: string | null;
    container: string | null;
    frameRate: number | null;
    bitRate: number | null;
    audioCodec: string | null;
    audioChannels: number | null;
    audioSampleRate: number | null;
  };
  derivatives: ManifestDerivative[];
  abr: ManifestAbr | null;
  thumbnails: ManifestThumbnail[];
  posterUrl: string | null;
  lqip: string | null;
  blurhash: string | null;
  generatedAt: string;
}

interface BuildAssetManifestInput {
  assetId: string;
  probe: MediaProbeResult;
  derivatives: Array<{
    variant: string;
    mediaKind: 'image' | 'video' | 'document';
    format: string;
    width: number | null;
    height: number | null;
    contentType: string;
    sizeBytes: number;
    canonicalUrl: string;
    objectKey: string;
  }>;
  abrManifests: ManifestAbr | null;
  thumbnails: ManifestThumbnail[];
  poster: string | null;
  lqip: string | null;
  blurhash: string | null;
}

/**
 * Builds a {@link MediaAssetManifest} from the probe result and generated
 * derivative metadata. The manifest is the single source of truth for a
 * processed asset's delivery surface.
 */
export function buildAssetManifest(input: BuildAssetManifestInput): MediaAssetManifest {
  return {
    schemaVersion: 1,
    assetId: input.assetId,
    mediaKind: input.probe.mediaKind,
    probe: {
      width: input.probe.width,
      height: input.probe.height,
      durationMs: input.probe.durationMs,
      codec: input.probe.codec,
      container: input.probe.container,
      frameRate: input.probe.frameRate,
      bitRate: input.probe.bitRate,
      audioCodec: input.probe.audioCodec,
      audioChannels: input.probe.audioChannels,
      audioSampleRate: input.probe.audioSampleRate,
    },
    derivatives: input.derivatives,
    abr: input.abrManifests,
    thumbnails: input.thumbnails,
    posterUrl: input.poster,
    lqip: input.lqip,
    blurhash: input.blurhash,
    generatedAt: new Date().toISOString(),
  };
}

export type { ImageDerivative };
