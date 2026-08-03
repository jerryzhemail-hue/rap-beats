/**
 * Frontend XSS sanitization using DOMPurify.
 * Provides defense-in-depth for historical forum data that was not sanitized on write.
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
