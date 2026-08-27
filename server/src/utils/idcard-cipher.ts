import crypto from 'crypto';

const RAW_KEY = process.env.BEATMAKER_IDCARD_KEY || 'dev-insecure-beatmaker-idcard-key-please-change';
// 派生一个固定 32 字节 key
const KEY = crypto.createHash('sha256').update(RAW_KEY).digest();

export function encryptIdCard(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 输出格式：base64(iv).base64(tag).base64(cipher)
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptIdCard(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('invalid idcard payload');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const enc = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** 身份证号脱敏：保留前 4 位 + 后 4 位 */
export function maskIdCard(plain: string): string {
  if (!plain || plain.length < 8) return '****';
  return `${plain.slice(0, 4)}${'*'.repeat(Math.max(plain.length - 8, 4))}${plain.slice(-4)}`;
}
