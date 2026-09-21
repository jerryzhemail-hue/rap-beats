/**
 * 用户输入校验 — 注册（auth）与资料修改（user）共用，避免规则漂移。
 * 每个函数返回错误消息；返回 null 表示通过。
 */

export function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 20) {
    return '用户名长度需在3-20字符之间';
  }
  // 仅允许字母/数字/下划线/连字符（与搜索/URL 兼容性一致）
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return '用户名仅支持字母、数字、下划线和连字符';
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return '邮箱格式不正确';
  }
  // email 实际存储上限 255，留 1 字符 buffer 提示用户
  if (email.length > 254) {
    return '邮箱长度不能超过 254 字符';
  }
  return null;
}

/**
 * 校验密码强度
 *
 * 策略：
 * - 最短 8 位（OWASP 推荐）
 * - 必须同时包含字母和数字（避免 12345678 这种纯数字）
 * - 允许大写/小写/特殊字符作为可选加强
 * - 禁止常见弱密码（top 100）
 */
const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'abc12345', '11111111', '00000000',
  'iloveyou', 'admin123', 'letmein1', 'welcome1', 'monkey123',
  'sunshine1', 'princess1', 'dragon123', 'master123', 'football1',
]);

export function validatePassword(password: string): string | null {
  if (!password || typeof password !== 'string') {
    return '请输入密码';
  }
  if (password.length < 8 || password.length > 128) {
    return '密码长度需在 8-128 字符之间';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return '密码必须同时包含字母和数字';
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return '密码过于简单，请使用更复杂的密码';
  }
  return null;
}

export function validateNickname(nickname: string | undefined | null): string | null {
  if (nickname === undefined || nickname === null || nickname === '') return null;
  if (nickname.length < 2 || nickname.length > 20) {
    return '昵称需要2-20个字符';
  }
  // 禁止 HTML / 控制字符 / 零宽字符 / 双向覆盖符
  // 零宽字符：U+200B-200D、U+2060、U+FEFF
  // 双向覆盖符：U+202A-202E、U+2066-2069（可造成 UI 重排攻击）
  if (/[<>]|[\x00-\x1F\x7F]|\u200B|\u200C|\u200D|\u202A|\u202B|\u202C|\u202D|\u202E|\u2066|\u2067|\u2068|\u2069|\u2060|\uFEFF/.test(nickname)) {
    return '昵称不允许包含特殊控制字符';
  }
  return null;
}

export function validateBio(bio: string | undefined | null): string | null {
  if (bio === undefined || bio === null || bio === '') return null;
  if (bio.length > 500) {
    return '个人简介不能超过 500 字符';
  }
  // 个人简介也加零宽字符过滤（防 UI 重排）
  if (/[<>]|[\x00-\x1F\x7F]|\u200B|\u200C|\u200D|\u202E|\uFEFF/.test(bio)) {
    return '个人简介不允许包含特殊控制字符';
  }
  return null;
}
