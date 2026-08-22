import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { initDatabase, getDatabaseClient, getForumDatabaseClient, initMySqlDatabaseClientFromEnv } from '../database/index.js';

// ⛔ 保护:此脚本只允许在本地开发环境运行,严禁在生产数据库跑
if (process.env.NODE_ENV === 'production') {
  console.error('❌ create-test-users 禁止在 NODE_ENV=production 环境下执行');
  console.error('   当前连到的 DB_NAME:', process.env.DB_NAME);
  console.error('   当前连到的 FORUM_DB_NAME:', process.env.FORUM_DB_NAME);
  console.error('   如确实需要在本地跑,请:NODE_ENV=development npm run create-test-users');
  process.exit(1);
}
if (process.env.DB_NAME === 'rap_beats' || process.env.FORUM_DB_NAME === 'rap_beats_forum') {
  console.error('❌ create-test-users 检测到线上库名,拒绝执行');
  console.error('   DB_NAME =', process.env.DB_NAME);
  console.error('   FORUM_DB_NAME =', process.env.FORUM_DB_NAME);
  process.exit(1);
}

const TEST_USERS = [
  {
    username: 'testuser',
    email: 'testuser@example.com',
    password: 'Test123456',
    role: 'user',
    vip_level: 'free',
  },
  {
    username: 'admin',
    email: 'admin@example.com',
    password: 'Admin123456',
    role: 'admin',
    vip_level: 'ultimate',
  },
];

async function main() {
  initMySqlDatabaseClientFromEnv();
  await initDatabase(getDatabaseClient(), getForumDatabaseClient());
  const db = getDatabaseClient();

  for (const u of TEST_USERS) {
    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(u.password, salt);

    const existing = await db.queryOne<{ id: number }>(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [u.username, u.email]
    );

    if (existing) {
      await db.execute(
        'UPDATE users SET username = ?, email = ?, password_hash = ?, role = ?, vip_level = ?, vip_expire_at = NULL WHERE id = ?',
        [u.username, u.email, password_hash, u.role, u.vip_level, existing.id]
      );
      console.log(`Updated: ${u.username} (${u.email}) — ${u.role}`);
    } else {
      await db.execute(
        'INSERT INTO users (username, email, password_hash, role, vip_level, vip_expire_at) VALUES (?, ?, ?, ?, ?, NULL)',
        [u.username, u.email, password_hash, u.role, u.vip_level]
      );
      console.log(`Created: ${u.username} (${u.email}) — ${u.role}`);
    }
  }

  console.log('\n=== Test Accounts ===');
  for (const u of TEST_USERS) {
    console.log(`Username: ${u.username}`);
    console.log(`Email:    ${u.email}`);
    console.log(`Password: ${u.password}`);
    console.log(`Role:     ${u.role}`);
    console.log('---');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
