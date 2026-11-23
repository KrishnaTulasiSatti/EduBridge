import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../../config/env';

/**
 * Private object storage. Files are stored under random keys with no relation to the
 * original filename, and are only ever served through an authorised API route.
 * Swap LocalDiskStorage for an S3 implementation in production.
 */
export interface ObjectStorage {
  put(buffer: Buffer): Promise<string>;
  read(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

class LocalDiskStorage implements ObjectStorage {
  constructor(private root: string) {}

  private resolve(key: string) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid storage key');
    return path.join(this.root, key.slice(0, 2), key);
  }

  async put(buffer: Buffer) {
    const key = crypto.randomUUID();
    const file = this.resolve(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, buffer, { flag: 'wx' });
    return key;
  }

  async read(key: string) {
    const file = this.resolve(key);
    await fsp.access(file);
    return fs.createReadStream(file);
  }

  async remove(key: string) {
    await fsp.rm(this.resolve(key), { force: true });
  }
}

export const storage: ObjectStorage = new LocalDiskStorage(path.resolve(env.UPLOAD_DIR));

/** Detects the real file type from its first bytes. Never trust the client-supplied MIME type. */
export function sniffMimeType(buf: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

export const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');
