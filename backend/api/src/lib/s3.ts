import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

const internalS3 = new S3Client({
  region: config.s3Region,
  endpoint: config.s3Endpoint,
  forcePathStyle: config.s3ForcePathStyle,
  credentials: {
    accessKeyId: config.s3AccessKey,
    secretAccessKey: config.s3SecretKey,
  },
});

export { internalS3 };

const signingS3 = new S3Client({
  region: config.s3Region,
  endpoint: config.s3PublicEndpoint,
  forcePathStyle: config.s3ForcePathStyle,
  credentials: {
    accessKeyId: config.s3AccessKey,
    secretAccessKey: config.s3SecretKey,
  },
});

function normalizedContentType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function maxUploadBytesForContentType(contentType: string): number {
  const normalized = normalizedContentType(contentType);
  if (normalized.startsWith('image/')) {
    return config.s3MaxImageUploadBytes;
  }
  if (normalized.startsWith('video/')) {
    return config.s3MaxVideoUploadBytes;
  }
  if (normalized.startsWith('audio/')) {
    return config.s3MaxAudioUploadBytes;
  }
  return config.s3MaxDocumentUploadBytes;
}

export function assertUploadPolicy(contentType: string, sizeBytes: number): {
  contentType: string;
  maxSizeBytes: number;
} {
  const normalized = normalizedContentType(contentType);
  if (!config.s3AllowedContentTypes.includes(normalized)) {
    throw new Error('UPLOAD_CONTENT_TYPE_NOT_ALLOWED');
  }

  const maxSizeBytes = maxUploadBytesForContentType(normalized);
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxSizeBytes) {
    throw new Error('UPLOAD_SIZE_NOT_ALLOWED');
  }

  return {
    contentType: normalized,
    maxSizeBytes,
  };
}

function publicObjectUrl(key: string): string {
  return `${config.s3CdnBaseUrl.replace(/\/$/, '')}/${config.s3Bucket}/${key}`;
}

export async function createUploadUrl(key: string, contentType: string, sizeBytes: number) {
  const policy = assertUploadPolicy(contentType, sizeBytes);
  const command = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
    ContentType: policy.contentType,
    ContentLength: sizeBytes,
    Metadata: {
      'declared-size-bytes': String(sizeBytes),
    },
  });

  const url = await getSignedUrl(signingS3, command, { expiresIn: config.s3PresignTtlSeconds });
  return {
    bucket: config.s3Bucket,
    key,
    url,
    publicUrl: publicObjectUrl(key),
    contentType: policy.contentType,
    sizeBytes,
    maxSizeBytes: policy.maxSizeBytes,
    expiresInSeconds: config.s3PresignTtlSeconds,
  };
}

export async function assertS3BucketConnectivity() {
  await internalS3.send(
    new HeadBucketCommand({
      Bucket: config.s3Bucket,
    })
  );
}

export async function putJsonObject(
  key: string,
  payload: unknown,
  options?: {
    cacheControl?: string;
    metadata?: Record<string, string>;
  }
): Promise<{ bucket: string; key: string; publicUrl: string }> {
  await internalS3.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
      CacheControl: options?.cacheControl ?? 'public, max-age=31536000, immutable',
      Metadata: options?.metadata,
    })
  );

  return {
    bucket: config.s3Bucket,
    key,
    publicUrl: publicObjectUrl(key),
  };
}

export async function assertObjectMatchesUploadPolicy(
  key: string,
  expectedContentType: string,
  expectedSizeBytes: number
): Promise<void> {
  const result = await internalS3.send(
    new HeadObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    })
  );

  const actualContentType = normalizedContentType(result.ContentType ?? '');
  if (actualContentType !== normalizedContentType(expectedContentType)) {
    throw new Error('UPLOADED_OBJECT_CONTENT_TYPE_MISMATCH');
  }
  if (result.ContentLength !== expectedSizeBytes) {
    throw new Error('UPLOADED_OBJECT_SIZE_MISMATCH');
  }
}

export async function deleteObject(key: string): Promise<void> {
  await internalS3.send(
    new DeleteObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    })
  );
}

/**
 * Generate a time-limited signed URL for downloading an object from S3.
 * Used for async DSAR export delivery — the export bundle is uploaded to S3
 * and the user receives a signed URL valid for a limited period.
 */
export async function presignGetObject(
  key: string,
  expiresInSeconds: number = 24 * 60 * 60,
): Promise<string> {
  return getSignedUrl(
    signingS3,
    new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function getObject(key: string): Promise<Buffer> {
  const result = await internalS3.send(
    new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    })
  );
  if (!result.Body) {
    throw new Error(`S3 object not found: ${key}`);
  }
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function putBinaryObject(
  key: string,
  buffer: Buffer,
  contentType: string,
  options?: { cacheControl?: string; metadata?: Record<string, string> },
): Promise<string> {
  await internalS3.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: options?.cacheControl ?? 'public, max-age=31536000, immutable',
      Metadata: options?.metadata,
    })
  );
  return publicObjectUrl(key);
}

// ── Multipart upload helpers ───────────────────────────────────────────
//
// S3 multipart uploads allow large files (typically video) to be uploaded in
// independent parts. Each part is presigned so the client uploads directly to
// S3. The backend tracks the upload session in `upload_multipart_sessions`
// and finalises by combining the part ETags.

/**
 * Initiate a multipart upload. Returns the S3 upload id and the object key.
 * The caller persists the upload id in `upload_multipart_sessions`.
 */
export async function createMultipartUpload(
  key: string,
  contentType: string,
): Promise<{ uploadId: string; key: string; bucket: string }> {
  const policy = assertUploadPolicy(contentType, config.s3MaxVideoUploadBytes);
  const command = new CreateMultipartUploadCommand({
    Bucket: config.s3Bucket,
    Key: key,
    ContentType: policy.contentType,
  });
  const response = await internalS3.send(command);
  if (!response.UploadId) {
    throw new Error('S3_CREATE_MULTIPART_UPLOAD_FAILED');
  }
  return {
    uploadId: response.UploadId,
    key,
    bucket: config.s3Bucket,
  };
}

/**
 * Presign a single part upload URL. The client PUTs the part bytes directly
 * to this URL. S3 returns an ETag in the response headers that the client
 * must capture and send back during completion.
 */
export async function presignPartUpload(
  key: string,
  uploadId: string,
  partNumber: number,
): Promise<{ url: string; partNumber: number; expiresInSeconds: number }> {
  const command = new UploadPartCommand({
    Bucket: config.s3Bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  const url = await getSignedUrl(signingS3, command, {
    expiresIn: config.s3PresignTtlSeconds,
  });
  return {
    url,
    partNumber,
    expiresInSeconds: config.s3PresignTtlSeconds,
  };
}

/**
 * Complete a multipart upload by submitting the list of (partNumber, ETag)
 * pairs. S3 assembles the final object and returns its location.
 */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<{ location: string; key: string; bucket: string }> {
  const command = new CompleteMultipartUploadCommand({
    Bucket: config.s3Bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map((p) => ({
        PartNumber: p.partNumber,
        ETag: p.etag,
      })),
    },
  });
  const response = await internalS3.send(command);
  return {
    location: response.Location ?? publicObjectUrl(key),
    key,
    bucket: config.s3Bucket,
  };
}

/**
 * Abort a multipart upload. Frees storage consumed by uploaded parts on S3.
 * Called when the client cancels or when the session expires.
 */
export async function abortMultipartUpload(
  key: string,
  uploadId: string,
): Promise<void> {
  await internalS3.send(
    new AbortMultipartUploadCommand({
      Bucket: config.s3Bucket,
      Key: key,
      UploadId: uploadId,
    }),
  );
}
