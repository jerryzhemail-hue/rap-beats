/**
 * 客户端格式化工具 — 单一来源
 *
 * 替代 .vue 文件里散落的 formatDate / formatTime / formatDuration / formatMoney / debounce
 *
 * 使用:
 *   import { formatDate, formatTime, formatDuration, formatMoney, debounce } from '@/utils/format'
 *
 * 设计原则:
 *   1. 所有时间字段接受 ISO 8601 string(Date | string 兼容)
 *   2. 缺失值统一返回空字符串或 0,绝不返回 'undefined'/'null' 字面值
 *   3. debounce / throttle 返回的函数自带 cancel 句柄
 *   4. 不引入 dayjs / date-fns 这类大依赖,自己写覆盖本项目所有场景
 */

/**
 * 相对时间格式化:刚刚 / X 分钟前 / X 小时前 / X 天前 / YYYY-MM-DD
 * 与 server 端 server/src/routes/forum.ts 的 formatDate 行为一致
 */
export function formatTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 0) return d.toLocaleDateString('zh-CN');
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
  return d.toLocaleDateString('zh-CN');
}

/**
 * 消息中心风格的相对时间:
 *   当天:HH:mm
 *   昨天:「昨天」
 *   < 7 天:X 天前
 *   更早:M月D日
 */
export function formatChatTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

/**
 * 完整本地化时间:YYYY-MM-DD HH:mm:ss(可指定时区)
 * 用于 admin 后台等需要精确到秒、可读性强的场景
 */
export function formatDateTime(
  dateStr: string | Date | null | undefined,
  timeZone?: string,
  emptyFallback = ''
): string {
  if (!dateStr) return emptyFallback;
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return emptyFallback;
  return d.toLocaleString('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 完整日期格式化:YYYY-MM-DD HH:mm(本地时区)
 * 用于列表/详情页"完整时间"展示
 * @param emptyFallback 空值时的回退字符串(默认 '' 与 ProfileView 一致;
 *   旧的 admin 页面期望 '-' 作为占位,可传 '-' 保留原行为)
 */
export function formatDate(
  dateStr: string | Date | null | undefined,
  emptyFallback = ''
): string {
  if (!dateStr) return emptyFallback;
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return emptyFallback;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/**
 * 日期(无时间):YYYY-MM-DD
 * @param emptyFallback 空值时的回退字符串(默认 '')
 */
export function formatDateOnly(
  dateStr: string | Date | null | undefined,
  emptyFallback = ''
): string {
  if (!dateStr) return emptyFallback;
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return emptyFallback;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 音频时长格式化:MM:SS(秒数 < 1 小时) / HH:MM:SS(>= 1 小时)
 * 用于音频播放器、Beat 时长展示
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * 金额格式化:¥X.XX(分位用逗号)
 * 用于 VIP 订单、积分兑换等需要金额展示的场景
 */
export function formatMoney(amount: number | string | null | undefined, currency = '¥'): string {
  if (amount == null || amount === '') return `${currency}0.00`;
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return `${currency}0.00`;
  return `${currency}${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * Debounce:延迟执行,期间重复调用会重置定时器
 * @param fn 待执行函数
 * @param delay 延迟毫秒
 * @returns 带 cancel() 的包装函数
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number
): ((...args: TArgs) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: TArgs) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
}

/**
 * Throttle:固定时间窗口内只执行一次
 */
export function throttle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  interval: number
): ((...args: TArgs) => void) & { cancel: () => void } {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: TArgs) => {
    const now = Date.now();
    const remain = interval - (now - lastCall);
    if (remain <= 0) {
      lastCall = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now();
        timer = null;
        fn(...args);
      }, remain);
    }
  };
  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
}