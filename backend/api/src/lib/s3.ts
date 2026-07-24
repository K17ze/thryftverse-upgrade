import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
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
