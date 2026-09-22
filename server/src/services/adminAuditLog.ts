/**
 * 管理员操作审计日志服务
 *
 * 设计原则：
 * - 异步 fire-and-forget 写入，审计日志失败不影响主业务流程
 * - detail 字段仅记录业务变更，不记录密码/哈希等敏感数据
 * - 操作结果（success/failure）必须明确记录，便于合规审查
 */

import { getDatabaseClient } from '../database/client.js';
import { toDateTimeString } from '../utils/timezone.js';

export interface AuditLogOptions {
  /** 执行操作的 Admin 用户 ID */
  adminId: number;
  /** Admin 用户名（快照，保留操作时的上下文） */
  adminUsername: string;
  /** 操作类型，如 user_role_change / beat_delete / license_template_update */
  action: string;
  /** 目标资源类型，如 user / beat / license_template / license_agreement */
  targetType: string;
  /** 目标资源 ID（字符串兼容 uuid / 复合键） */
  targetId: string;
  /** 目标资源的可读标识，如用户名 / beat 标题 */
  targetLabel?: string;
  /**
   * 操作详情（不含密码 / 哈希等敏感字段）。
   * 示例：{ newRole: 'admin', oldRole: 'user' }
   *          { beatId: 123, title: 'xxx' }
   *          { licenseId: 5, contentHash: '...' }
   */
  detail?: Record<string, unknown>;
  /** Express Request，用于提取 IP 和 User-Agent */
  request?: import('express').Request;
  /** 操作结果，默认 success */
  result?: 'success' | 'failure';
  /** 失败原因描述（仅 result='failure' 时填写） */
  resultMessage?: string;
}

/**
 * 记录一条管理员操作审计日志。
 *
 * 调用示例：
 *   await logAdminAction({ adminId: 1, adminUsername: 'admin', action: 'user_role_change',
 *     targetType: 'user', targetId: '42', targetLabel: 'testuser',
 *     detail: { newRole: 'admin', oldRole: 'user' }, request: req });
 */
export async function logAdminAction(options: AuditLogOptions): Promise<void> {
  const {
    adminId,
    adminUsername,
    action,
    targetType,
    targetId,
    targetLabel = null,
    detail = null,
    request,
    result = 'success',
    resultMessage = null,
  } = options;

  // 提取 IP（兼容 X-Forwarded-For 和 X-Real-IP）
  let ipAddress: string | null = null;
  if (request) {
    const forwarded = request.headers['x-forwarded-for'];
    ipAddress = Array.isArray(forwarded) ? forwarded[0]?.split(',')[0]?.trim() ?? null
      : forwarded?.split(',')[0]?.trim() ?? null;
    if (!ipAddress) ipAddress = request.ip ?? null;
  }

  const userAgent = request?.headers['user-agent']?.slice(0, 500) ?? null;
  const detailJson = detail ? JSON.stringify(detail) : null;

  try {
    const db = getDatabaseClient();
    await db.execute(
      `INSERT INTO admin_audit_log
         (admin_id, admin_username, action, target_type, target_id, target_label,
          detail, ip_address, user_agent, result, result_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId,
        adminUsername,
        action,
        targetType,
        targetId,
        targetLabel,
        detailJson,
        ipAddress,
        userAgent,
        result,
        resultMessage,
        toDateTimeString(new Date()),
      ]
    );
  } catch (err) {
    // fire-and-forget：审计日志写入失败不影响主业务
    console.error('[adminAuditLog] 写入审计日志失败:', err);
  }
}
