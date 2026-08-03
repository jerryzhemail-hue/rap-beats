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
 */
export function getLocalDate(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 8 * 60 * 60 * 1000); // UTC+8
}

/**
 * 获取上海时区的"今天"开始时刻（00:00:00）的 MySQL DATETIME 格式字符串
 */
export function getLocalDateTimeStart(): string {
  const d = getLocalDate();
  d.setHours(0, 0, 0, 0);
  return toDateTimeString(d);
}

/**
 * 获取上海时区的"今天"结束时刻（23:59:59）的 MySQL DATETIME 格式字符串
 */
export function getLocalDateTimeEnd(): string {
  const d = getLocalDate();
  d.setHours(23, 59, 59, 999);
  return toDateTimeString(d);
}

/**
 * 将 Date 转换为 MySQL DATETIME 格式（YYYY-MM-DD HH:MM:SS）
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
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
