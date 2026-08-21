import type { Response } from 'express';

/**
 * 私信实时推送服务（Server-Sent Events）
 *
 * 维护用户 id → SSE 连接集合的内存映射，发送私信时通过 pushToUser 向
 * 在线接收者推送事件。浏览器端用 EventSource 自动重连，无需额外依赖。
 *
 * 设计说明：
 * - 连接池仅在单进程内存中，水平扩展时需引入 Redis pub/sub（当前单实例足够）。
 * - 心跳注释行每 25 秒发送一次，防止 Nginx/代理层因空闲超时关闭连接。
 */

type SseResponse = Response;

/** userId → 该用户所有活跃 SSE 连接 */
const clientMap = new Map<number, Set<SseResponse>>();

/** 每个连接的心跳定时器（res → timerId），用于关闭时清理 */
const heartbeatMap = new Map<SseResponse, NodeJS.Timeout>();

const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * 注册一个用户的 SSE 连接到连接池。
 * 设置 SSE 响应头、启动心跳保活，并返回清理函数。
 */
export function addClient(userId: number, res: SseResponse): void {
  // SSE 响应头：保持长连接、禁用代理缓冲、声明事件流
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let set = clientMap.get(userId);
  if (!set) {
    set = new Set();
    clientMap.set(userId, set);
  }
  set.add(res);

  // 心跳：发送注释行，保持连接活跃，避免代理层超时断开
  const timer = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatMap.set(res, timer);

  // 首次发送一个 connected 事件，便于前端确认链路已建立
  writeEvent(res, 'connected', { user_id: userId, at: new Date().toISOString() });
}

/**
 * 从连接池移除指定连接，并清理心跳定时器。
 * 客户端断开时调用（req.on('close')）。
 */
export function removeClient(userId: number, res: SseResponse): void {
  const timer = heartbeatMap.get(res);
  if (timer) {
    clearInterval(timer);
    heartbeatMap.delete(res);
  }
  const set = clientMap.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clientMap.delete(userId);
}

/**
 * 向指定用户的所有在线连接推送一个 SSE 事件。
 * 若用户不在线（无连接）则静默跳过——消息已落库，下次拉取/进入页面时可见。
 *
 * @returns 实际推送到的连接数
 */
export function pushToUser(userId: number, event: string, data: unknown): number {
  const set = clientMap.get(userId);
  if (!set || set.size === 0) return 0;

  let delivered = 0;
  for (const res of set) {
    if (res.writableEnded) {
      // 连接已关闭，跳过（清理交给 close 回调）
      continue;
    }
    try {
      writeEvent(res, event, data);
      delivered++;
    } catch {
      // 单个连接写入失败不影响其他连接
    }
  }
  return delivered;
}

/**
 * 向单个 SSE 连接写入一个标准事件。
 * 格式：event: <event>\ndata: <json>\n\n
 */
function writeEvent(res: SseResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * 返回某用户当前在线连接数（主要用于健康检查/调试）。
 */
export function getOnlineClientCount(userId: number): number {
  return clientMap.get(userId)?.size ?? 0;
}
