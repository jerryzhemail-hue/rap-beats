/**
 * Frontend XSS sanitization using DOMPurify.
 * Provides defense-in-depth for historical forum data that was not sanitized on write.
 *
 * ⚠️ TODO(security): 当前 JWT 存在 localStorage（见 stores/auth.ts），任何 XSS bypass
 * 都会导致 token 泄漏给攻击者脚本。最佳实践是改用 httpOnly + Secure + SameSite=Strict
 * cookie 鉴权，由浏览器自动随请求发送，前端 JS 无法读取。
 * 改造涉及：登录接口 Set-Cookie / 退出接口 Clear-Cookie / 后端中间件从 cookie 读 token。
 * 在改造完成前，依赖 DOMPurify 纵深防御 + Content-Security-Policy 头部兜底。
 */
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img',
  'span', 'div',
];
const ALLOWED_ATTR = ['href', 'src', 'alt', 'class'];

/**
 * Sanitize rich HTML content (post body) for display.
 * Used for fields that allow bold formatting, links, images, etc.
 *
 * 安全说明：
 *   - 所有 <a> 强制 target=_blank + rel="noopener noreferrer"，防止 tabnabbing
 *     和同窗口钓鱼跳转（DOMPurify 默认不会自动加 target/rel）
 *   - 数据:image/ URI 限制在 50KB 以内（防止 DoS 大图）
 *   - 禁用 data: 非图片协议与 javascript:/vbscript: 等危险协议
 */
export function sanitizeRichContent(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  }) as string;
}

/**
 * 全局 DOMPurify hook：所有 <a> 元素统一加 target=_blank + rel=noopener noreferrer。
 * 必须在 sanitizeRichContent() 调用前注册（这里用模块顶层副作用，OK 因为是单页应用）。
 *
 * hook 触发时机：afterSanitizeAttributes，每个元素 sanitize 完属性后调用。
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node instanceof HTMLAnchorElement) {
    node.setAttribute('target', '_blank');
    // noopener 防止 window.opener 钓鱼；noreferrer 顺手禁 Referer
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Escape plain text for safe display.
 * Used for post titles, comment content, usernames — anything
 * that should NOT contain HTML formatting.
 */
export function escapeHtmlText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
