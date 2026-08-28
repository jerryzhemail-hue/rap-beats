import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: [resolve(__dirname, 'tests/setup.ts')],
    include: ['tests/**/*.test.ts'],
    // 串行执行避免 MySQL 死锁（多个测试同时操作 users / sessions 等表）
    fileParallelism: false,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
