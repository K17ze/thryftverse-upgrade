export type MediaAssetStatus =
  | 'created'
  | 'upload_authorised'
  | 'object_received'
  | 'integrity_verified'
  | 'scan_pending'
  | 'processing'
  | 'moderation_pending'
  | 'publishable'
  | 'published'
  | 'upload_expired'
  | 'integrity_failed'
  | 'quarantined'
  | 'rejected'
  | 'processing_failed'
  | 'revoked'
  | 'deleted';

export type MediaScanStatus = 'pending' | 'clean' | 'infected' | 'failed';
export type MediaModerationStatus =
  | 'pending'
  | 'approved'
  | 'review'
  | 'rejected'
  | 'failed';

const terminalStatuses = new Set<MediaAssetStatus>([
  'upload_expired',
  'integrity_failed',
  'quarantined',
  'rejected',
  'revoked',
  'deleted',
]);

const transitions: Record<MediaAssetStatus, ReadonlySet<MediaAssetStatus>> = {
  created: new Set(['upload_authorised', 'upload_expired', 'deleted']),
  upload_authorised: new Set(['object_received', 'upload_expired', 'integrity_failed']),
  object_received: new Set(['integrity_verified', 'integrity_failed', 'quarantined']),
  integrity_verified: new Set(['scan_pending', 'processing', 'integrity_failed', 'quarantined', 'revoked']),
  scan_pending: new Set(['processing', 'quarantined', 'processing_failed', 'revoked']),
  processing: new Set([
    'moderation_pending',
    'publishable',
    'integrity_failed',
    'quarantined',
    'rejected',
    'processing_failed',
    'revoked',
  ]),
  moderation_pending: new Set(['publishable', 'rejected', 'processing_failed', 'revoked']),
  publishable: new Set(['published', 'rejected', 'revoked']),
  published: new Set(['revoked']),
  upload_expired: new Set(['deleted']),
  integrity_failed: new Set(['deleted']),
  quarantined: new Set(['deleted']),
  rejected: new Set(['deleted']),
  processing_failed: new Set(['integrity_verified', 'processing', 'revoked', 'deleted']),
  revoked: new Set(['deleted']),
  deleted: new Set(),
};

export function canTransitionMediaAsset(
  from: MediaAssetStatus,
  to: MediaAssetStatus,
): boolean {
  return from === to || transitions[from].has(to);
}

export function assertMediaAssetTransition(
  from: MediaAssetStatus,
  to: MediaAssetStatus,
): void {
  if (!canTransitionMediaAsset(from, to)) {
    throw new Error(`MEDIA_INVALID_TRANSITION:${from}:${to}`);
  }
}

export function isMediaAssetTerminal(status: MediaAssetStatus): boolean {
  return terminalStatuses.has(status);
}

export type MediaProcessingOutcome = {
  status: MediaAssetStatus;
  scanStatus: MediaScanStatus;
  moderationStatus: MediaModerationStatus;
  processingStatus: 'completed' | 'failed';
  failureReason: string | null;
  quarantineReason: string | null;
};

export function resolveMediaProcessingOutcome(input: {
  declaredContentType: string;
  declaredSizeBytes: number;
  detectedContentType: string;
  detectedSizeBytes: number;
  scanStatus: Exclude<MediaScanStatus, 'pending'>;
  moderationStatus: Exclude<MediaModerationStatus, 'pending'>;
  processingSucceeded: boolean;
  processorError?: string | null;
}): MediaProcessingOutcome {
  const declaredType = input.declaredContentType.split(';')[0]?.trim().toLowerCase();
  const detectedType = input.detectedContentType.split(';')[0]?.trim().toLowerCase();

  if (
    !declaredType
    || declaredType !== detectedType
    || input.detectedSizeBytes !== input.declaredSizeBytes
  ) {
    return {
      status: 'integrity_failed',
      scanStatus: input.scanStatus,
      moderationStatus: input.moderationStatus,
      processingStatus: 'failed',
      failureReason: 'Detected media metadata does not match the authorised upload',
      quarantineReason: null,
    };
  }

  if (input.scanStatus === 'infected') {
    return {
      status: 'quarantined',
      scanStatus: input.scanStatus,
      moderationStatus: input.moderationStatus,
      processingStatus: 'failed',
      failureReason: null,
      quarantineReason: 'Malware scan rejected the uploaded object',
    };
  }

  if (input.scanStatus === 'failed') {
    return {
      status: 'processing_failed',
      scanStatus: input.scanStatus,
      moderationStatus: input.moderationStatus,
      processingStatus: 'failed',
      failureReason: input.processorError ?? 'Media security scan failed',
      quarantineReason: null,
    };
  }

  if (input.moderationStatus === 'rejected') {
    return {
      status: 'rejected',
      scanStatus: input.scanStatus,
      moderationStatus: input.moderationStatus,
      processingStatus: input.processingSucceeded ? 'completed' : 'failed',
      failureReason: input.processingSucceeded
        ? null
        : input.processorError ?? 'Media processing failed',
      quarantineReason: null,
    };
  }

  if (
    input.moderationStatus === 'failed'
    || input.moderationStatus === 'review'
    || !input.processingSucceeded
  ) {
    return {
      status: input.moderationStatus === 'review'
        ? 'moderation_pending'
        : 'processing_failed',
      scanStatus: input.scanStatus,
      moderationStatus: input.moderationStatus,
      processingStatus: input.processingSucceeded ? 'completed' : 'failed',
      failureReason: input.moderationStatus === 'review'
        ? null
        : input.processorError ?? 'Media processing or moderation failed',
      quarantineReason: null,
    };
  }

  return {
    status: 'publishable',
    scanStatus: 'clean',
    moderationStatus: 'approved',
    processingStatus: 'completed',
    failureReason: null,
    quarantineReason: null,
  };
}

export function mediaKindForContentType(
  contentType: string,
): 'image' | 'video' | 'audio' | 'document' {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (normalized.startsWith('image/')) {
    return 'image';
  }
  if (normalized.startsWith('video/')) {
    return 'video';
  }
  if (normalized.startsWith('audio/')) {
    return 'audio';
  }
  return 'document';
}
