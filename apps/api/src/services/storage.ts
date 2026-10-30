import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PhotoContentType } from '@claims/shared';
import type { Config } from '../config';

export interface PresignedUpload {
  url: string;
  headers: Record<string, string>;
  expiresIn: number;
}

export interface PhotoStorage {
  buildKey(claimId: string, contentType: PhotoContentType): string;
  presignUpload(key: string, contentType: PhotoContentType): Promise<PresignedUpload>;
  presignDownload(key: string): Promise<string>;
}

const EXTENSIONS: Record<PhotoContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
};

export function photoKey(claimId: string, contentType: PhotoContentType): string {
  return `claims/${claimId}/${randomUUID()}.${EXTENSIONS[contentType]}`;
}

/**
 * S3-backed storage. Clients upload directly to S3 with a short-lived pre-signed PUT,
 * so photo bytes never pass through the API.
 */
export class S3PhotoStorage implements PhotoStorage {
  private readonly signer: S3Client;

  constructor(private readonly config: Config) {
    // Sign against the public endpoint so URLs work from a phone when running LocalStack.
    this.signer = new S3Client({
      region: config.AWS_REGION,
      endpoint: config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      ...(config.S3_ENDPOINT
        ? { credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }
        : {}),
    });
  }

  buildKey(claimId: string, contentType: PhotoContentType): string {
    return photoKey(claimId, contentType);
  }

  async presignUpload(key: string, contentType: PhotoContentType): Promise<PresignedUpload> {
    const expiresIn = this.config.UPLOAD_URL_TTL_SECONDS;
    const url = await getSignedUrl(
      this.signer,
      new PutObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn },
    );
    return { url, headers: { 'Content-Type': contentType }, expiresIn };
  }

  presignDownload(key: string): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }),
      { expiresIn: this.config.DOWNLOAD_URL_TTL_SECONDS },
    );
  }
}
