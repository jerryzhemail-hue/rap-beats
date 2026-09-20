import crypto from 'crypto';

const RAW_KEY = process.env.BEATMAKER_IDCARD_KEY || '';
// dev/insecure 哨兵值列表：这些值在生产部署中绝不能被使用。
// 任一出现即 fail-fast，防止密钥缺失时静默回退到可猜的默认值。
const FORBIDDEN_KEYS = new Set<string>([
  '',
  'dev-insecure-beatmaker-idcard-key-please-change',
  'change-me',
  'changeme',
  'secret',
  'password',
]);

if (FORBIDDEN_KEYS.has(RAW_KEY)) {
  throw new Error(
    '[idcard-cipher] BEATMAKER_IDCARD_KEY 未配置或仍为占位默认值。' +
    '生产环境必须显式设置一个 32 字节随机串（生成方式：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"）。'
  );
}
if (RAW_KEY.length < 32) {
  throw new Error('[idcard-cipher] BEATMAKER_IDCARD_KEY 长度不足 32 字符，不安全。');
}
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

/**
 * 身份证号不可逆哈希（SHA-256 + 固定 pepper）。
 * 用于"一个身份证号只能绑定到一个账号"的去重查询：
 * 同明文 → 同哈希，不同明文 → 极低概率碰撞。
 */
const RAW_HASH_PEPPER = process.env.BEATMAKER_IDCARD_PEPPER || '';
const FORBIDDEN_PEPPERS = new Set<string>([
  '',
  'dev-idcard-pepper-please-change',
  'change-me',
  'pepper',
]);
if (FORBIDDEN_PEPPERS.has(RAW_HASH_PEPPER)) {
  throw new Error(
    '[idcard-cipher] BEATMAKER_IDCARD_PEPPER 未配置或仍为占位默认值。' +
    '生产环境必须显式设置一个 32 字节以上随机串。'
  );
}
const IDCARD_HASH_PEPPER = RAW_HASH_PEPPER;
export function hashIdCard(plain: string): string {
  return crypto
    .createHash('sha256')
    .update(`${IDCARD_HASH_PEPPER}:${plain.trim().toUpperCase()}`)
    .digest('hex');
}
