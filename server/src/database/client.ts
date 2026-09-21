import mysql from 'mysql2/promise';
import { config } from '../config.js';

export type SqlParams = readonly unknown[];

export type ExecuteResult = {
  insertId?: number;
  affectedRows: number;
};

function normalizeSqlParams(params: SqlParams = []): unknown[] {
  return params.map((param) => (param === undefined ? null : param));
}

export interface DatabaseClient {
  queryOne<T>(sql: string, params?: SqlParams): Promise<T | undefined>;
  queryMany<T>(sql: string, params?: SqlParams): Promise<T[]>;
  execute(sql: string, params?: SqlParams): Promise<ExecuteResult>;
  transaction<T>(handler: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

let mainDatabaseClient: DatabaseClient | null = null;
let forumDatabaseClient: DatabaseClient | null = null;
let membershipDatabaseClient: DatabaseClient | null = null;
let mainMysqlPool: mysql.Pool | null = null;
let forumMysqlPool: mysql.Pool | null = null;
let membershipMysqlPool: mysql.Pool | null = null;
// 缓存初始化失败状态：避免每次请求都重试已知的失败连接（防止启动风暴）
const initError: { main?: Error; forum?: Error; membership?: Error } = {};

export function getDbDriver(): 'mysql' {
  const raw = (process.env.DB_DRIVER || 'mysql').toLowerCase();
  if (raw !== 'mysql') {
    throw new Error(`Unsupported DB_DRIVER "${raw}". Expected "mysql".`);
  }
  return 'mysql';
}

class MySqlDatabaseClient implements DatabaseClient {
  constructor(private readonly pool: mysql.Pool) {}

  async queryOne<T>(sql: string, params: SqlParams = []): Promise<T | undefined> {
    const [rows] = await this.pool.query(sql, normalizeSqlParams(params));
    const list = rows as T[];
    return list[0];
  }

  async queryMany<T>(sql: string, params: SqlParams = []): Promise<T[]> {
    const [rows] = await this.pool.query(sql, normalizeSqlParams(params));
    return rows as T[];
  }

  async execute(sql: string, params: SqlParams = []): Promise<ExecuteResult> {
    const [result] = await this.pool.execute(sql, normalizeSqlParams(params) as any);
    const header = result as mysql.ResultSetHeader;
    const affectedRows = typeof header.affectedRows === 'number' ? header.affectedRows : 0;
    const insertId = typeof header.insertId === 'number' ? header.insertId : undefined;
    return { affectedRows, insertId };
  }

  async transaction<T>(handler: (client: DatabaseClient) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const txClient: DatabaseClient = {
        queryOne: async <T>(sql: string, params: SqlParams = []) => {
          const [rows] = await connection.query(sql, normalizeSqlParams(params));
          const list = rows as T[];
          return list[0];
        },
        queryMany: async <T>(sql: string, params: SqlParams = []) => {
          const [rows] = await connection.query(sql, normalizeSqlParams(params));
          return rows as T[];
        },
        execute: async (sql: string, params: SqlParams = []) => {
          const [result] = await connection.execute(sql, normalizeSqlParams(params) as any);
          const header = result as mysql.ResultSetHeader;
          const affectedRows = typeof header.affectedRows === 'number' ? header.affectedRows : 0;
          const insertId = typeof header.insertId === 'number' ? header.insertId : undefined;
          return { affectedRows, insertId };
        },
        transaction: async <T>(inner: (client: DatabaseClient) => Promise<T>) => {
          return inner(txClient);
        }
      };

      const result = await handler(txClient);
      await connection.commit();
      return result;
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}
      throw error;
    } finally {
      connection.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function getDatabaseClient(): DatabaseClient {
  if (initError.main) throw initError.main;
  if (!mainDatabaseClient) {
    if (!mainMysqlPool) initMySqlDatabaseClientFromEnv();
    if (!mainMysqlPool) throw new Error('MySQL main client not initialized');
    mainDatabaseClient = new MySqlDatabaseClient(mainMysqlPool);
  }
  return mainDatabaseClient;
}

export function getForumDatabaseClient(): DatabaseClient {
  if (initError.forum) throw initError.forum;
  if (!forumDatabaseClient) {
    if (!forumMysqlPool) initForumMySqlDatabaseClientFromEnv();
    if (!forumMysqlPool) throw new Error('MySQL forum client not initialized');
    forumDatabaseClient = new MySqlDatabaseClient(forumMysqlPool);
  }
  return forumDatabaseClient;
}

export function getMembershipDatabaseClient(): DatabaseClient {
  if (initError.membership) throw initError.membership;
  if (!membershipDatabaseClient) {
    if (!membershipMysqlPool) initMembershipMySqlDatabaseClientFromEnv();
    if (!membershipMysqlPool) throw new Error('MySQL membership client not initialized');
    membershipDatabaseClient = new MySqlDatabaseClient(membershipMysqlPool);
  }
  return membershipDatabaseClient;
}

function createPool(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}): mysql.Pool {
  // ── SSL 配置（生产必须，公网/跨网部署防中间人）
  // 通过 env 注入:
  //   MYSQL_SSL_CA         — PEM 格式 CA 证书内容（base64 / 原始 PEM 都可）
  //   MYSQL_SSL_CA_PATH    — CA 证书路径（与 CA 二选一）
  //   MYSQL_SSL_REJECT_UNAUTHORIZED=true — 拒绝未授权证书（生产默认 true）
  // 未设置 SSL 时日志警告但仍允许连接（兼容本地 dev）
  let sslOption: mysql.SslOptions | undefined;
  if (process.env.MYSQL_SSL_CA || process.env.MYSQL_SSL_CA_PATH) {
    let caCert: string | undefined;
    if (process.env.MYSQL_SSL_CA) {
      caCert = process.env.MYSQL_SSL_CA;
      // base64 编码容错
      if (caCert && !caCert.includes('BEGIN CERTIFICATE')) {
        try { caCert = Buffer.from(caCert, 'base64').toString('utf8'); }
        catch { /* ignore — 用原始值 */ }
      }
    } else if (process.env.MYSQL_SSL_CA_PATH) {
      try {
        caCert = require('node:fs').readFileSync(process.env.MYSQL_SSL_CA_PATH, 'utf8');
      } catch (e: any) {
        console.error(`[db] MYSQL_SSL_CA_PATH 读取失败: ${e.message}`);
      }
    }
    sslOption = {
      ca: caCert,
      rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false',
    };
  } else if ((process.env.NODE_ENV || 'development').toLowerCase() === 'production') {
    console.warn(
      '[db] 警告：生产环境 (NODE_ENV=production) 未配置 MYSQL_SSL_CA，存在中间人攻击风险。'
    );
  }

  // 只传 mysql2 认识的连接选项;sharesMainPool 等业务 flag 已剥离
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit,
    charset: 'utf8mb4',  // 显式指定，确保中文 nickname 等字段 LIKE 查询不丢匹配
    waitForConnections: true,
    queueLimit: 0,
    idleTimeout: 60 * 1000,
    maxIdle: 10,
    multipleStatements: false,
    connectTimeout: 10_000, // 防止 Node 挂死（默认无限制）
    ...(sslOption ? { ssl: sslOption } : {}),
  });
}

export function initMySqlDatabaseClientFromEnv() {
  try {
    const { main } = config().db;
    mainMysqlPool = createPool(main);
    mainDatabaseClient = null;
    delete initError.main;
  } catch (e: any) {
    initError.main = e;
    throw e;
  }
}

function initForumMySqlDatabaseClientFromEnv() {
  try {
    const { main, forum } = config().db;

    if (forum.sharesMainPool) {
      forumMysqlPool = mainMysqlPool;
      forumDatabaseClient = null;
      delete initError.forum;
      return;
    }

    if (!forum.user) {
      throw new Error('Forum MySQL config missing: FORUM_DB_USER is required when FORUM_DB_NAME is set');
    }

    forumMysqlPool = createPool(forum);
    forumDatabaseClient = null;
    delete initError.forum;
  } catch (e: any) {
    initError.forum = e;
    throw e;
  }
}

function initMembershipMySqlDatabaseClientFromEnv() {
  try {
    const { main, membership } = config().db;

    if (membership.sharesMainPool) {
      membershipMysqlPool = mainMysqlPool;
      membershipDatabaseClient = null;
      delete initError.membership;
      return;
    }

    if (!membership.user) {
      throw new Error('Membership MySQL config missing: MEMBERSHIP_DB_USER is required when MEMBERSHIP_DB_NAME is set');
    }

    membershipMysqlPool = createPool(membership);
    membershipDatabaseClient = null;
    delete initError.membership;
  } catch (e: any) {
    initError.membership = e;
    throw e;
  }
}
