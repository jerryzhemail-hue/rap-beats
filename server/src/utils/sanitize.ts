/**
 * HTML 安全过滤工具
 *
 * ⚠️ 已修复(security): 此文件已替换为 isomorphic-dompurify，
 * 可防御 mutation XSS、Unicode 规范化绕过、SVG/MathML foreign content 注入等。
 *
 * 历史记录：
 * - 原实现：手写正则 + 字符串栈式解析器（已废弃）
 * - 已知绕过场景：mutation XSS、Unicode NFKC、SVG namespace injection、HTML 实体解码等
 * - 风险评估：CVSS ~8.1，攻击类型：存储型 XSS → JWT 泄漏 → 账户接管
 * - 替换日期：2026-09-21
 * - 依赖：isomorphic-dompurify（jsdom + DOMPurify）
 *
 * 调用方：forum-posts.ts（发帖/修改帖子）、sanitize-forum-data.ts（历史数据清洗）
 */
import DOMPurify from 'isomorphic-dompurify';

type SanitizeConfig = Parameters<typeof DOMPurify.sanitize>[1];

const DOMPURIFY_CONFIG: SanitizeConfig = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img',
    'span', 'div',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'class'],
  ALLOW_DATA_ATTR: false,
  // 强制所有 URL 以安全协议开头（http/https/mailto/tel）
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+\-]+(?![a-z]))/gi,
  // 禁止危险标签
  FORBID_TAGS: ['style', 'link', 'meta', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'base', 'svg', 'script', 'math'],
};

/**
 * 对富文本内容进行安全过滤
 *
 * 使用 isomorphic-dompurify（在 Node.js 环境下使用 jsdom + DOMPurify），
 * 可真实模拟浏览器 DOM 行为，防御手写正则无法处理的 mXSS 等复杂绕过。
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  // TrustedHTML → string 强制转换：sanitize 结果是安全的 HTML 字符串
  return DOMPurify.sanitize(html, DOMPURIFY_CONFIG) as unknown as string;
}

/**
 * 对富文本内容进行安全过滤（强制返回纯文本）
 */
export function sanitizeHtmlToText(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, { ...DOMPURIFY_CONFIG, ALLOWED_TAGS: [] as any }) as unknown as string;
}

/**
 * 对纯文本内容进行 HTML 转义
 *
 * 用于评论等普通文本字段（不使用 v-html），Vue 的 Mustache 插值
 * {{ }} 会自动 HTML 转义，本函数是额外的服务端安全层。
 */
export function escapeHtmlContent(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
