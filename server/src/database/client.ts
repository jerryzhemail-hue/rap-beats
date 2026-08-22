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
}

let mainDatabaseClient: DatabaseClient | null = null;
let forumDatabaseClient: DatabaseClient | null = null;
let mainMysqlPool: mysql.Pool | null = null;
let forumMysqlPool: mysql.Pool | null = null;

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
}

export function getDatabaseClient(): DatabaseClient {
  if (!mainDatabaseClient) {
    if (!mainMysqlPool) initMySqlDatabaseClientFromEnv();
    if (!mainMysqlPool) throw new Error('MySQL main client not initialized');
    mainDatabaseClient = new MySqlDatabaseClient(mainMysqlPool);
  }
  return mainDatabaseClient;
}

export function getForumDatabaseClient(): DatabaseClient {
  if (!forumDatabaseClient) {
    if (!forumMysqlPool) initForumMySqlDatabaseClientFromEnv();
    if (!forumMysqlPool) throw new Error('MySQL forum client not initialized');
    forumDatabaseClient = new MySqlDatabaseClient(forumMysqlPool);
  }
  return forumDatabaseClient;
}

function createPool(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}): mysql.Pool {
  return mysql.createPool({
    ...config,
    waitForConnections: true,
    queueLimit: 0,
    idleTimeout: 60 * 1000,
    maxIdle: 10,
    multipleStatements: false
  });
}

export function initMySqlDatabaseClientFromEnv() {
  const { main } = config().db;
  mainMysqlPool = createPool(main);
  mainDatabaseClient = null;
}

function initForumMySqlDatabaseClientFromEnv() {
  const { main, forum } = config().db;

  if (forum.sharesMainPool) {
    forumMysqlPool = mainMysqlPool;
    forumDatabaseClient = null;
    return;
  }

  if (!forum.user) {
    throw new Error('Forum MySQL config missing: FORUM_DB_USER is required when FORUM_DB_NAME is set');
  }

  forumMysqlPool = createPool(forum);
  forumDatabaseClient = null;
}
