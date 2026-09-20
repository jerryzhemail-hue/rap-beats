/**
 * 统一时区处理工具
 * 
 * 项目统一使用 Asia/Shanghai (UTC+8) 作为业务时区。
 * 所有"今天"的计算都基于本地时间，确保签到、每日限制等业务逻辑
 * 在早上 0 点正确重置，而不是 UTC 0 点（即北京时间 8 点）。
 */

const TIMEZONE = 'Asia/Shanghai';

/**
 * 获取上海时区的当前日期字符串（YYYY-MM-DD）
 */
export function getLocalDateString(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date()).replace(/\//g, '-');
}

/**
 * 获取上海时区的当前 Date 对象（用于 Date 构造）
 *
 * ⚠️ 此函数返回的 Date 对象，其内部 timestamp 与上海时区的"现在"一致，
 * 但 JS 会把它当 UTC 显示（即 getHours()/getDate() 等读取的是 UTC 视图，
 * 而不是上海时区）。只能在以下场景使用：
 *   - 仅用于做时差换算（不读 getter）
 *   - 或者与 toUtcDateTimeString() 配合使用
 *
 * 推荐做法：直接用 getLocalDateString() 或下面的 getShanghaiDateParts()，
 * 不要再走 setHours/setDate 这类基于"本地时区"的 getter/setter。
 */
export function getLocalDate(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 8 * 60 * 60 * 1000); // UTC+8
}

/**
 * 获取上海时区"今天"的年/月/日（number 三元组）。
 * 这是计算"上海今天 00:00 / 23:59"的唯一可靠方式 —— 不依赖服务器系统时区。
 */
export function getShanghaiDateParts(date: Date = new Date()): { year: number; month: number; day: number } {
  // Intl 会输出 'YYYY/MM/DD'（zh-CN locale）
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * 获取上海时区的"今天"开始时刻（00:00:00）的 MySQL DATETIME 格式字符串。
 *
 * 与原实现的区别：原先用 setHours(0,0,0,0) 会按服务器本地时区设置，
 * 导致非 Asia/Shanghai 服务器上的"今天 00:00"实际不是北京时间 00:00。
 * 这里改用 Intl + Date.UTC() 显式构造上海时区的瞬间。
 */
export function getLocalDateTimeStart(): string {
  const { year, month, day } = getShanghaiDateParts();
  return formatDateTime(year, month, day, 0, 0, 0);
}

/**
 * 获取上海时区的"今天"结束时刻（23:59:59.999）的 MySQL DATETIME 格式字符串。
 *
 * 与 getLocalDateTimeStart() 同源修复。
 */
export function getLocalDateTimeEnd(): string {
  const { year, month, day } = getShanghaiDateParts();
  return formatDateTime(year, month, day, 23, 59, 59);
}

function formatDateTime(year: number, month: number, day: number, h: number, m: number, s: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)} ${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * 将 Date 转换为 MySQL DATETIME 格式（YYYY-MM-DD HH:MM:SS）
 * ⚠️ 使用的是服务器系统时区，跨时区服务器会与业务时区不一致。
 * 仅在已知服务器在 Asia/Shanghai 时区时使用。
 */
export function toDateTimeString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

/**
 * 转换为 MySQL DATE 格式（YYYY-MM-DD）
 * ⚠️ 使用的是服务器系统时区，跨时区服务器会与业务时区不一致。
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
