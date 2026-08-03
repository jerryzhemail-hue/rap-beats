import fs from 'fs';
import path from 'path';
import OSS from 'ali-oss';
import { fileURLToPath } from 'url';

export type StorageKind =
  | 'audio'
  | 'cover'
  | 'avatar'
  | 'banner'
  | 'forum_image'
  | 'forum_audio'
  | 'forum_video'
  | 'forum_video_cover';
type StorageDriver = 'local' | 'oss' | 'cos' | 's3';

type SaveBufferOptions = {
  buffer: Buffer;
  originalName?: string;
  fileNamePrefix?: string;
  extension?: string;
};

type DirectUploadOptions = {
  originalName?: string;
  fileNamePrefix?: string;
  extension?: string;
  contentType?: string;
  expiresInSeconds?: number;
};

export type DirectUploadTarget = {
  kind: StorageKind;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  storedValue: string;
  publicUrl: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');

const LOCAL_DIRS: Record<StorageKind, string> = {
  audio: path.join(DATA_DIR, 'audio'),
  cover: path.join(DATA_DIR, 'covers'),
  avatar: path.join(DATA_DIR, 'avatars'),
  banner: path.join(DATA_DIR, 'banners'),
  forum_image: path.join(DATA_DIR, 'forum-images'),
  forum_audio: path.join(DATA_DIR, 'forum-audio'),
  forum_video: path.join(DATA_DIR, 'forum-video'),
  forum_video_cover: path.join(DATA_DIR, 'forum-video-covers')
};

const PUBLIC_PREFIX: Record<StorageKind, string> = {
  audio: '/audio',
  cover: '/covers',
  avatar: '/avatars',
  banner: '/banners',
  forum_image: '/forum-images',
  forum_audio: '/forum-audio',
  forum_video: '/forum-video',
  forum_video_cover: '/forum-video-covers'
};

let ossClient: OSS | null = null;

function getStorageDriver(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  if (driver === 'local' || driver === 'oss' || driver === 'cos' || driver === 's3') {
    return driver;
  }
  return 'local';
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('//');
}

function normalizeExtension(originalName?: string, explicitExtension?: string): string {
  const ext = explicitExtension || (originalName ? path.extname(originalName) : '');
  if (!ext) return '';
  return ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
}

function createFileName(kind: StorageKind, originalName?: string, explicitExtension?: string, fileNamePrefix?: string): string {
  const ext = normalizeExtension(originalName, explicitExtension);
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const prefix = fileNamePrefix || kind;
  return `${prefix}-${uniqueSuffix}${ext}`;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function getOssPrefix(kind: StorageKind): string {
  const fromEnv = {
    audio: process.env.OSS_AUDIO_PREFIX,
    cover: process.env.OSS_COVER_PREFIX,
    avatar: process.env.OSS_AVATAR_PREFIX,
    banner: process.env.OSS_BANNER_PREFIX,
    forum_image: process.env.OSS_FORUM_IMAGE_PREFIX,
    forum_audio: process.env.OSS_FORUM_AUDIO_PREFIX,
    forum_video: process.env.OSS_FORUM_VIDEO_PREFIX,
    forum_video_cover: process.env.OSS_FORUM_VIDEO_COVER_PREFIX
  }[kind];

  return (
    fromEnv ||
    {
      audio: 'audio',
      cover: 'covers',
      avatar: 'avatars',
      banner: 'banners',
      forum_image: 'forum-images',
      forum_audio: 'forum-audio',
      forum_video: 'forum-video',
      forum_video_cover: 'forum-video-covers'
    }[kind]
  ).replace(/^\/+|\/+$/g, '');
}

function inferOssPublicBaseUrl(): string {
  const explicit = process.env.OSS_PUBLIC_BASE_URL;
  if (explicit) return normalizeBaseUrl(explicit);

  const bucket = process.env.OSS_BUCKET;
  const endpoint = process.env.OSS_ENDPOINT;
  const region = process.env.OSS_REGION;

  if (!bucket) {
    throw new Error('Missing OSS_BUCKET for OSS storage driver.');
  }

  if (endpoint) {
    return normalizeBaseUrl(`https://${bucket}.${endpoint.replace(/^https?:\/\//, '')}`);
  }

  if (!region) {
    throw new Error('Missing OSS_REGION for OSS storage driver.');
  }

  return `https://${bucket}.${region}.aliyuncs.com`;
}

function getOssClient(): OSS {
  if (ossClient) return ossClient;

  const region = process.env.OSS_REGION;
  const bucket = process.env.OSS_BUCKET;
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;

  if (!region || !bucket || !accessKeyId || !accessKeySecret) {
    throw new Error('OSS storage requires OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID and OSS_ACCESS_KEY_SECRET.');
  }

  ossClient = new OSS({
    region,
    bucket,
    accessKeyId,
    accessKeySecret,
    endpoint: process.env.OSS_ENDPOINT || undefined,
    stsToken: process.env.OSS_STS_TOKEN || undefined,
    secure: true
  });

  return ossClient;
}

function createOssObjectKey(
  kind: StorageKind,
  options: Pick<SaveBufferOptions, 'originalName' | 'fileNamePrefix' | 'extension'>
): string {
  return `${getOssPrefix(kind)}/${createFileName(kind, options.originalName, options.extension, options.fileNamePrefix)}`;
}

function extractOssObjectKey(kind: StorageKind, storedValue: string): string {
  if (isRemoteUrl(storedValue)) {
    const url = storedValue.startsWith('//') ? new URL(`https:${storedValue}`) : new URL(storedValue);
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  }

  if (storedValue.startsWith('/')) {
    return storedValue.replace(/^\/+/, '');
  }

  const prefix = getOssPrefix(kind);
  if (storedValue.startsWith(`${prefix}/`)) {
    return storedValue;
  }

  return `${prefix}/${storedValue.replace(/^\/+/, '')}`;
}

function getOssPublicUrl(objectKey: string): string {
  return `${inferOssPublicBaseUrl()}/${objectKey.replace(/^\/+/, '')}`;
}

function assertImplementedDriver(driver: StorageDriver): never {
  throw new Error(`Storage driver "${driver}" is not implemented yet. Use STORAGE_DRIVER=local or STORAGE_DRIVER=oss.`);
}

export function initStorage(): void {
  const driver = getStorageDriver();
  if (driver === 'local') {
    for (const dir of Object.values(LOCAL_DIRS)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return;
  }

  if (driver === 'oss') {
    getOssClient();
    inferOssPublicBaseUrl();
    return;
  }

  assertImplementedDriver(driver);
}

export async function saveBuffer(kind: StorageKind, options: SaveBufferOptions): Promise<{ storedValue: string; publicUrl: string }> {
  const driver = getStorageDriver();
  if (driver === 'local') {
    initStorage();

    const fileName = createFileName(kind, options.originalName, options.extension, options.fileNamePrefix);
    const filePath = path.join(LOCAL_DIRS[kind], fileName);
    fs.writeFileSync(filePath, options.buffer);

    return {
      storedValue: fileName,
      publicUrl: `${PUBLIC_PREFIX[kind]}/${fileName}`
    };
  }

  if (driver === 'oss') {
    const client = getOssClient();
    const objectKey = createOssObjectKey(kind, options);
    await client.put(objectKey, options.buffer);
    const publicUrl = getOssPublicUrl(objectKey);
    return {
      storedValue: publicUrl,
      publicUrl
    };
  }

  return assertImplementedDriver(driver);
}

export async function saveText(kind: StorageKind, content: string, options: Omit<SaveBufferOptions, 'buffer'> = {}): Promise<{ storedValue: string; publicUrl: string }> {
  return saveBuffer(kind, {
    ...options,
    buffer: Buffer.from(content, 'utf8')
  });
}

export async function deleteStoredAsset(kind: StorageKind, storedValue: string | null | undefined): Promise<void> {
  if (!storedValue) return;

  const driver = getStorageDriver();

  if (driver === 'local') {
    if (isRemoteUrl(storedValue)) return;

    const localPath = resolveLocalAssetPath(kind, storedValue);
    if (!localPath) return;

    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    } catch (err) {
      console.warn(`[storage] Failed to delete local asset: ${localPath}`, err);
    }
    return;
  }

  if (driver === 'oss') {
    try {
      const client = getOssClient();
      const objectKey = extractOssObjectKey(kind, storedValue);
      await client.delete(objectKey);
    } catch (err) {
      console.warn(`[storage] Failed to delete OSS asset: ${storedValue}`, err);
    }
    return;
  }

  assertImplementedDriver(driver);
}

export function resolvePublicAssetUrl(kind: StorageKind, storedValue: string | null | undefined): string | null {
  if (!storedValue) return null;
  if (isRemoteUrl(storedValue)) return storedValue;
  if (storedValue.startsWith('/')) return storedValue;
  return `${PUBLIC_PREFIX[kind]}/${storedValue}`;
}

export function resolveLocalAssetPath(kind: StorageKind, storedValue: string | null | undefined): string | null {
  if (!storedValue) return null;
  if (isRemoteUrl(storedValue)) return null;

  const normalized = storedValue.startsWith(PUBLIC_PREFIX[kind])
    ? path.basename(storedValue)
    : path.basename(storedValue.replace(/^\//, ''));

  return path.join(LOCAL_DIRS[kind], normalized);
}

export function isLocalStorageEnabled(): boolean {
  return getStorageDriver() === 'local';
}

export function isRemoteStorageEnabled(): boolean {
  return !isLocalStorageEnabled();
}

export function getSignedAssetUrl(
  kind: StorageKind,
  storedValue: string | null | undefined,
  options: {
    expiresInSeconds?: number;
    forceDownload?: boolean;
    downloadFileName?: string;
  } = {}
): string | null {
  if (!storedValue) return null;

  const driver = getStorageDriver();
  if (driver === 'local') {
    return resolvePublicAssetUrl(kind, storedValue);
  }

  if (driver === 'oss') {
    const client = getOssClient();
    const objectKey = extractOssObjectKey(kind, storedValue);
    const response: Record<string, string> = {};

    if (options.forceDownload) {
      response['content-disposition'] = `attachment; filename="${encodeURIComponent(options.downloadFileName || path.basename(objectKey))}"`;
    }

    return client.signatureUrl(objectKey, {
      expires: options.expiresInSeconds || 300,
      response
    });
  }

  return assertImplementedDriver(driver);
}

export function getStorageMode(): StorageDriver {
  return getStorageDriver();
}

export function supportsDirectUpload(): boolean {
  return getStorageDriver() === 'oss';
}

export function createDirectUploadTarget(kind: StorageKind, options: DirectUploadOptions = {}): DirectUploadTarget | null {
  const driver = getStorageDriver();
  if (driver === 'local') return null;

  if (driver === 'oss') {
    const client = getOssClient();
    const objectKey = createOssObjectKey(kind, options);
    const contentType = options.contentType || 'application/octet-stream';
    const uploadUrl = client.signatureUrl(objectKey, {
      method: 'PUT',
      expires: options.expiresInSeconds || 600,
      'Content-Type': contentType
    });
    const publicUrl = getOssPublicUrl(objectKey);

    return {
      kind,
      uploadUrl,
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      storedValue: publicUrl,
      publicUrl
    };
  }

  return assertImplementedDriver(driver);
}
