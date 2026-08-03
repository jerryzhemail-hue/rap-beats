/**
 * HTML 安全过滤工具
 * 
 * 采用白名单策略：只允许一小部分安全标签和属性，
 * 移除所有脚本、事件处理器和危险内容。
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img',
  'span', 'div',
]);

const ALLOWED_ATTRS = new Set([
  'href',           // <a>
  'src', 'alt',     // <img>
  'class',          // 所有标签
]);

// data:image/ URI 超过此字节数（base64 原文）时剥离 src，防止 DoS
const MAX_DATA_URI_CHARS = 50 * 1024;

// 危险模式
const DANGEROUS_PATTERNS = [
  /<script[\s\S]*?<\/script>/gi,
  /<iframe[\s\S]*?<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,      // onclick, onerror, onload, etc.
  /data:/gi,
  /vbscript:/gi,
  /expression\s*\(/gi,
  /url\s*\(/gi,
];

/**
 * 对富文本内容进行安全过滤
 * 
 * @param html 原始 HTML 内容
 * @returns 过滤后的安全 HTML
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';

  let result = html;

  // 1. 移除危险模式（脚本、事件处理器、危险协议）
  for (const pattern of DANGEROUS_PATTERNS) {
    result = result.replace(pattern, '');
  }

  // 2. 移除所有 HTML 标签，保留标签之间的文本
  // 然后用白名单重新构建安全的 HTML
  
  // 3. 只保留白名单标签
  // 使用栈式解析器处理标签
  const stack: string[] = [];
  let output = '';
  let pos = 0;
  
  while (pos < result.length) {
    const tagStart = result.indexOf('<', pos);
    
    if (tagStart === -1) {
      // 剩余文本
      output += escapeHtml(result.slice(pos));
      break;
    }
    
    // 标签前的文本
    if (tagStart > pos) {
      output += escapeHtml(result.slice(pos, tagStart));
    }
    
    const tagEnd = result.indexOf('>', tagStart);
    if (tagEnd === -1) {
      // 未闭合的标签，当作文本
      output += escapeHtml(result.slice(tagStart));
      break;
    }
    
    const tagContent = result.slice(tagStart + 1, tagEnd);
    pos = tagEnd + 1;
    
    // 解析标签名和属性
    const isClosing = tagContent.startsWith('/');
    const tagParts = tagContent.split(/\s+/);
    const tagName = (isClosing ? tagParts[0].slice(1) : tagParts[0]).toLowerCase();
    
    if (!ALLOWED_TAGS.has(tagName)) {
      // 非白名单标签，跳过
      continue;
    }
    
    if (isClosing) {
      // 闭合标签
      if (stack.length > 0 && stack[stack.length - 1] === tagName) {
        stack.pop();
        output += `</${tagName}>`;
      }
      continue;
    }
    
    // 自闭合标签
    if (tagContent.endsWith('/')) {
      output += `<${tagName}>`;
      continue;
    }
    
    // 开放标签：过滤属性后加入栈
    let safeAttrs = '';
    for (let i = 1; i < tagParts.length; i++) {
      const attrPart = tagParts[i];
      if (!attrPart) continue;
      
      const [attrName, attrValue] = attrPart.split('=');
      const cleanAttrName = attrName.toLowerCase();
      
      if (!ALLOWED_ATTRS.has(cleanAttrName)) continue;
      
      // href 和 src 必须以安全协议开头
      if (cleanAttrName === 'href' || cleanAttrName === 'src') {
        let cleanValue = attrValue ? attrValue.replace(/^["']|["']$/g, '').trim() : '';
        // 允许 http/https/data URI (图片)，禁止 javascript 等
        if (!/^(https?:|data:image\/)/i.test(cleanValue) && !cleanValue.startsWith('/')) {
          continue;
        }
        // 禁止 data: 其他类型
        if (/^data:(?!image\/)/i.test(cleanValue)) continue;
        // data:image/ URI 超过限制时剥离 src（保留 alt 可见）
        if (/^data:image\//i.test(cleanValue) && cleanValue.length > MAX_DATA_URI_CHARS) {
          continue;
        }

        safeAttrs += ` ${cleanAttrName}="${escapeHtmlAttr(cleanValue)}"`;
      } else if (cleanAttrName === 'class' || cleanAttrName === 'alt') {
        const cleanValue = attrValue ? attrValue.replace(/^["']|["']$/g, '').trim() : '';
        safeAttrs += ` ${cleanAttrName}="${escapeHtmlAttr(cleanValue)}"`;
      }
    }
    
    stack.push(tagName);
    output += `<${tagName}${safeAttrs}>`;
  }
  
  // 闭合未闭合的标签
  while (stack.length > 0) {
    output += `</${stack.pop()}>`;
  }
  
  return output;
}

/**
 * HTML 实体转义（用于文本内容）
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * HTML 属性值转义
 */
function escapeHtmlAttr(value: string): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 对纯文本内容进行 HTML 转义
 * 用于评论等普通文本字段
 */
export function escapeHtmlContent(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return escapeHtml(text);
}
