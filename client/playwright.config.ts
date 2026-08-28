import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 配置
 *
 * 假设环境里有以下服务（手动或脚本提前启动）：
 * - server: http://localhost:3000
 * - client: http://localhost:5173
 *
 * 如果 CI/本地想自动启动，可用 webServer 字段。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,   // E2E 串联跑，避免并发修改数据库
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
