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

export function validateNickname(nickname: string | undefined | null): string | null {
  if (nickname === undefined || nickname === null || nickname === '') return null;
  if (nickname.length < 2 || nickname.length > 20) {
    return '昵称需要2-20个字符';
  }
  // 禁止 HTML / 控制字符，避免任何潜在的 v-html 误用造成 XSS
  if (/[<>]|[\x00-\x1F\x7F]/.test(nickname)) {
    return '昵称不允许包含 < > 或控制字符';
  }
  return null;
}

export function validateBio(bio: string | undefined | null): string | null {
  if (bio === undefined || bio === null || bio === '') return null;
  if (bio.length > 500) {
    return '个人简介不能超过 500 字符';
  }
  if (/[<>]/.test(bio)) {
    return '个人简介不允许包含 < >';
  }
  return null;
}
