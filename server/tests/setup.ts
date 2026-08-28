/**
 * Vitest 全局 setup：
 * 1. dotenv 加载 .env.test 环境变量
 * 2. 初始化数据库连接池（dotenv 加载后立即执行）
 * 3. 创建所有表结构（幂等）
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.test'), override: true })

import {
  initMySqlDatabaseClientFromEnv,
  getDatabaseClient,
  getForumDatabaseClient,
  getMembershipDatabaseClient,
  initDatabase,
} from '../src/database/index.js'

// 初始化连接池（不会建表，只创建连接）
initMySqlDatabaseClientFromEnv()

export async function setup() {
  await initDatabase(
    getDatabaseClient(),
    getForumDatabaseClient(),
    getMembershipDatabaseClient()
  )
}

export default setup
