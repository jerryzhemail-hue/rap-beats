# 测试账号清单

所有账号统一密码：**Test123456**

---

## 🔹 普通用户（免费）

### 账号1：testuser
- **用户名**：`testuser`
- **邮箱**：`testuser@example.com`
- **密码**：`Test123456`
- **角色**：普通用户
- **VIP等级**：无（free）
- **用途**：测试免费用户功能

### 账号2：user1
- **用户名**：`user1`
- **邮箱**：`user1@test.local`
- **密码**：`Test123456`（如果不是请查看脚本）
- **角色**：普通用户
- **VIP等级**：无（free）

---

## 💎 VIP用户

### 基础会员（Basic）
- **用户名**：`test_basic`
- **邮箱**：`test_basic@example.com`
- **密码**：`Test123456`
- **VIP等级**：basic
- **到期时间**：2026-09-28（30天）
- **权益**：基础VIP功能

### 高级会员（Premium）
- **用户名**：`test_premium`
- **邮箱**：`test_premium@example.com`
- **密码**：`Test123456`
- **VIP等级**：premium
- **到期时间**：2026-11-27（90天）
- **权益**：可访问 VIP 专属伴奏

### 至尊会员（Ultimate）
- **用户名**：`test_ultimate`
- **邮箱**：`test_ultimate@example.com`
- **密码**：`Test123456`
- **VIP等级**：ultimate
- **到期时间**：2027-08-29（365天）
- **权益**：全部高级功能

---

## 👑 管理员账号

### 管理员1：admin
- **用户名**：`admin`
- **邮箱**：`admin@example.com`
- **密码**：`Admin123456`（注意首字母大写）
- **角色**：admin
- **用途**：后台管理、内容审核、用户管理

### 管理员2：user1（兼具管理权限）
- **用户名**：`user1`
- **邮箱**：`user1@test.local`
- **密码**：查看 create-admin.ts 脚本
- **角色**：admin

---

## 🧪 测试场景建议

### 权限测试
1. **普通用户 (testuser)** → 尝试播放/下载 VIP 专属伴奏 → 应拦截并引导升级
2. **高级会员 (test_premium)** → 可正常播放/下载 VIP 专属伴奏
3. **至尊会员 (test_ultimate)** → 拥有全部权限

### 会员过期测试
- 修改 `vip_users.vip_expire_at` 为过去时间，验证权限自动失效

### 后台管理测试
- **admin** 账号登录 `/admin` 路径，测试管理功能

---

## 📝 快速登录命令（开发用）

```sql
-- 查看所有测试账号
SELECT 
  u.id,
  u.username,
  u.email,
  u.role,
  COALESCE(v.vip_level, 'free') as vip_level,
  v.is_vip,
  DATE_FORMAT(v.vip_expire_at, '%Y-%m-%d') as expires
FROM users u
LEFT JOIN vip_users v ON u.id = v.user_id
WHERE u.username IN ('testuser', 'admin', 'test_basic', 'test_premium', 'test_ultimate', 'user1')
ORDER BY u.role DESC, v.is_vip DESC;

-- 手动延长VIP时间
UPDATE vip_users SET vip_expire_at = DATE_ADD(NOW(), INTERVAL 365 DAY) WHERE user_id = 410;

-- 清除VIP状态（测试过期场景）
UPDATE vip_users SET is_vip = 0, vip_expire_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE user_id = 409;
```

---

## 🔐 密码重置（如忘记）

```bash
cd server
node --import tsx/esm -e "
import bcrypt from 'bcryptjs';
console.log(bcrypt.hashSync('Test123456', 10));
"
```

生成的hash更新到 `users.password_hash` 字段即可。
