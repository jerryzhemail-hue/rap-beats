import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { initDatabase, getDatabaseClient, getForumDatabaseClient, getMembershipDatabaseClient, initMySqlDatabaseClientFromEnv } from '../database/index.js';

// ⛔ 保护:此脚本只允许在本地开发环境运行,严禁在生产数据库跑
if (process.env.NODE_ENV === 'production') {
  console.error('❌ create-test-users-batch 禁止在 NODE_ENV=production 环境下执行');
  console.error('   当前连到的 DB_NAME:', process.env.DB_NAME);
  console.error('   当前连到的 FORUM_DB_NAME:', process.env.FORUM_DB_NAME);
  console.error('   如确实需要在本地跑,请:NODE_ENV=development npm run create-test-users-batch');
  process.exit(1);
}
if (process.env.DB_NAME === 'rap_beats' || process.env.FORUM_DB_NAME === 'rap_beats_forum') {
  console.error('❌ create-test-users-batch 检测到线上库名,拒绝执行');
  console.error('   DB_NAME =', process.env.DB_NAME);
  console.error('   FORUM_DB_NAME =', process.env.FORUM_DB_NAME);
  process.exit(1);
}

const COUNT = parseInt(process.argv[2] || '20', 10);
const PREFIX = 'user';
const BASE_EMAIL_DOMAIN = 'test.local';

async function main() {
  initMySqlDatabaseClientFromEnv();
  await initDatabase(getDatabaseClient(), getForumDatabaseClient(), getMembershipDatabaseClient());
  const db = getDatabaseClient();

  const accounts: Array<{ username: string; email: string; password: string; role: string; vip_level: string }> = [];

  for (let i = 1; i <= COUNT; i++) {
    const username = `${PREFIX}${i}`;
    const email = `${username}@${BASE_EMAIL_DOMAIN}`;
    const password = `Test123456`;
    const role = i === 1 ? 'admin' : 'user';
    const vip_level = i <= 3 ? 'ultimate' : 'free';

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);

    const existing = await db.queryOne<{ id: number }>(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing) {
      await db.execute(
        'UPDATE users SET username = ?, email = ?, password_hash = ?, role = ?, vip_level = ?, vip_expire_at = NULL WHERE id = ?',
        [username, email, password_hash, role, vip_level, existing.id]
      );
      console.log(`Updated: ${username} (${email}) — ${role} — ${vip_level}`);
    } else {
      await db.execute(
        'INSERT INTO users (username, email, password_hash, role, vip_level, vip_expire_at) VALUES (?, ?, ?, ?, ?, NULL)',
        [username, email, password_hash, role, vip_level]
      );
      console.log(`Created: ${username} (${email}) — ${role} — ${vip_level}`);
    }

    accounts.push({ username, email, password, role, vip_level });
  }

  console.log('\n=== Test Accounts ===');
  console.log(`共 ${accounts.length} 个账号，密码统一为: Test123456\n`);
  for (const a of accounts) {
    console.log(`Username: ${a.username}`);
    console.log(`Email:    ${a.email}`);
    console.log(`Password: Test123456`);
    console.log(`Role:     ${a.role}`);
    console.log(`VIP:      ${a.vip_level}`);
    console.log('---');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
