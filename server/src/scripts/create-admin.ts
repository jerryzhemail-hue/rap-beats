import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { initDatabase, getDatabaseClient, getForumDatabaseClient, getMembershipDatabaseClient, initMySqlDatabaseClientFromEnv } from '../database/index.js';

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const username = readArg('--username') ?? process.env.ADMIN_USERNAME;
const email = readArg('--email') ?? process.env.ADMIN_EMAIL;
const password = readArg('--password') ?? process.env.ADMIN_PASSWORD;

if (!username || !email || !password) {
  console.error(
    'Missing required fields. Usage: npm run create-admin -- --username <username> --email <email> --password <password>\n' +
      'Or set env: ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD'
  );
  process.exit(1);
}

const requiredUsername = username;
const requiredEmail = email;
const requiredPassword = password;

async function main() {
  initMySqlDatabaseClientFromEnv();
  await initDatabase(getDatabaseClient(), getForumDatabaseClient(), getMembershipDatabaseClient());
  const database = getDatabaseClient();

  const [byUsername, byEmail] = await Promise.all([
    database.queryOne<{ id: number; username: string; email: string }>(
      'SELECT id, username, email FROM users WHERE username = ?',
      [requiredUsername]
    ),
    database.queryOne<{ id: number; username: string; email: string }>(
      'SELECT id, username, email FROM users WHERE email = ?',
      [requiredEmail]
    )
  ]);

  if (byUsername && byEmail && byUsername.id !== byEmail.id) {
    console.error(
      `Conflict: username "${username}" belongs to user#${byUsername.id}, but email "${email}" belongs to user#${byEmail.id}.`
    );
    process.exit(1);
  }

  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(requiredPassword, salt);

  const target = byUsername ?? byEmail;
  if (target) {
    await database.execute('UPDATE users SET username = ?, email = ?, password_hash = ?, role = ?, vip_level = ?, vip_expire_at = NULL WHERE id = ?', [
      requiredUsername,
      requiredEmail,
      password_hash,
      'admin',
      'ultimate',
      target.id
    ]);
  } else {
    await database.execute('INSERT INTO users (username, email, password_hash, role, vip_level, vip_expire_at) VALUES (?, ?, ?, ?, ?, NULL)', [
      requiredUsername,
      requiredEmail,
      password_hash,
      'admin',
      'ultimate'
    ]);
  }

  const user = await database.queryOne<{
    id: number;
    username: string;
    email: string;
    role: string;
    vip_level: string | null;
    vip_expire_at: string | null;
    avatar_url: string | null;
    created_at: string;
  }>(
    'SELECT id, username, email, role, vip_level, vip_expire_at, avatar_url, created_at FROM users WHERE username = ?',
    [requiredUsername]
  );

  console.log(JSON.stringify({ ok: true, user }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
