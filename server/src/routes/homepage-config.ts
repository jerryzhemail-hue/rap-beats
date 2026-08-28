import { Router, Response } from 'express';
import { requireAdmin, optionalAuth, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient } from '../database/client.js';
import { getEffectiveVipLevel } from '../middleware/vip.js';

const router = Router();

// ─── GET /api/homepage-config ──────────────────────────
// 公开接口：返回当前用户角色可见的模块列表
router.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();

  const rows = await database.queryMany<{
    module_key: string;
    module_label: string;
    sort_order: number;
    visible_to_guest: number;
    visible_to_user: number;
    visible_to_vip: number;
    visible_to_beatmaker: number;
    visible_to_admin: number;
  }>(
    `SELECT module_key, module_label, sort_order,
            visible_to_guest, visible_to_user, visible_to_vip,
            visible_to_beatmaker, visible_to_admin
       FROM homepage_module_config
      ORDER BY sort_order ASC`
  );

  // 判断当前用户角色
  let role: 'guest' | 'user' | 'vip' | 'beatmaker' | 'admin' = 'guest';
  if (req.user) {
    if (req.user.role === 'admin') {
      role = 'admin';
    } else if (req.user.is_beatmaker) {
      role = 'beatmaker';
    } else {
      const vipLevel = getEffectiveVipLevel(req.user);
      if (vipLevel && vipLevel !== 'free') {
        role = 'vip';
      } else {
        role = 'user';
      }
    }
  }

  // 根据角色过滤可见模块
  const roleField = `visible_to_${role}`;
  const visibleModules = rows
    .filter((r) => r[roleField as keyof typeof r] === 1)
    .map((r) => ({
      module_key: r.module_key,
      module_label: r.module_label,
      sort_order: r.sort_order,
    }));

  return res.json({
    role,
    modules: visibleModules,
  });
});

// ─── GET /api/admin/homepage-config ─────────────────────
// 管理员接口：返回全部配置（含所有角色的可见性）
router.get('/admin', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();

  const rows = await database.queryMany(
    `SELECT module_key, module_label, sort_order,
            visible_to_guest, visible_to_user, visible_to_vip,
            visible_to_beatmaker, visible_to_admin, updated_at
       FROM homepage_module_config
      ORDER BY sort_order ASC`
  );

  return res.json({ items: rows });
});

// ─── PUT /api/admin/homepage-config ─────────────────────
// 管理员接口：批量更新配置
router.put('/admin', requireAdmin, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const { items } = req.body ?? {};

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: '参数格式不正确' });
  }

  const adminId = req.user!.id;

  for (const item of items) {
    const {
      module_key,
      visible_to_guest,
      visible_to_user,
      visible_to_vip,
      visible_to_beatmaker,
      visible_to_admin,
    } = item;

    if (!module_key) continue;

    await database.execute(
      `UPDATE homepage_module_config
          SET visible_to_guest = ?,
              visible_to_user = ?,
              visible_to_vip = ?,
              visible_to_beatmaker = ?,
              visible_to_admin = ?,
              updated_by = ?
        WHERE module_key = ?`,
      [
        visible_to_guest ? 1 : 0,
        visible_to_user ? 1 : 0,
        visible_to_vip ? 1 : 0,
        visible_to_beatmaker ? 1 : 0,
        visible_to_admin ? 1 : 0,
        adminId,
        module_key,
      ]
    );
  }

  return res.json({ message: '配置已更新' });
});

export default router;
