/**
 * client/e2e/e2e.spec.ts
 * E2E 测试：P0 核心用户路径
 *
 * 前置：server (port 3000) + client (port 5173) 均已启动。
 * 登录数据通过后端 API 直接写入 DB（绕过后端 UI 注册流程）。
 */
import { test, expect, Page } from '@playwright/test'

const BASE = 'http://localhost:5173'

/** 创建一个测试用户并返回 token（通过 API 直调 server） */
async function createTestUser(page: Page) {
  const username = `e2e_${Date.now()}`
  const email = `${username}@test.com`
  const password = 'Test@1234'
  const res = await page.request.post(`${BASE}/api/auth/register`, {
    data: { username, email, password },
  })
  const body = await res.json()
  return { username, email, password, token: body.token, userId: body.user?.id }
}

/** 注入 token 到 localStorage，刷新页面 */
async function login(page: Page, email: string, password: string) {
  const res = await page.request.post(`${BASE}/api/auth/login`, {
    data: { login: email, password },
  })
  const body = await res.json()
  const token = body.token
  if (!token) throw new Error('Login failed')
  await page.goto(BASE)
  await page.evaluate((tk) => {
    localStorage.setItem('rap-beats-token', tk)
  }, token)
  return token
}

// ── TC-E2E-001 P0 首页访问 ──────────────────────────────────────────────────
test('TC-E2E-001 首页正常加载，包含 Footer', async ({ page }) => {
  await page.goto(`${BASE}/`)
  await expect(page).toHaveTitle(/.*/)
  await page.waitForSelector('footer', { timeout: 8000 })
  const footer = page.locator('footer')
  await expect(footer).toBeVisible()
})

// ── TC-E2E-002 P0 用户注册流程 ──────────────────────────────────────────────
test('TC-E2E-002 注册成功，跳转首页', async ({ page }) => {
  await page.goto(`${BASE}/register`)
  const username = `e2e_reg_${Date.now()}`
  await page.fill('input[placeholder*="3-20"]', username)
  await page.fill('input[placeholder*="email"]', `${username}@test.com`)
  await page.fill('input[placeholder*="至少6个"]', 'Test@1234')
  await page.fill('input[placeholder*="再次"]', 'Test@1234')
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE}/` as string, { timeout: 8000 })
  await expect(page).toHaveURL(/^https?:\/\/localhost:5173\/$/)
})

// ── TC-E2E-003 P0 用户登录 ──────────────────────────────────────────────────
test('TC-E2E-003 登录成功进入首页', async ({ page }) => {
  const user = await createTestUser(page)
  await page.goto(`${BASE}/login`)
  await page.fill('input[placeholder*="用户名或邮箱"]', user.email)
  await page.fill('input[placeholder*="输入密码"]', user.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE}/` as string, { timeout: 8000 })
  await expect(page).toHaveURL(/^https?:\/\/localhost:5173\/$/)
})

// ── TC-E2E-004 P0 Beats 列表页需登录 ────────────────────────────────────────
test('TC-E2E-004 未登录访问 /beats 重定向到登录', async ({ page }) => {
  await page.goto(`${BASE}/beats`)
  await page.waitForURL(/\/login/, { timeout: 8000 })
  await expect(page).toHaveURL(/\/login/)
})

// ── TC-E2E-005 P0 首页 Footer 包含联系/版权信息 ────────────────────────────
test('TC-E2E-005 Footer 显示版权和联系信息', async ({ page }) => {
  await page.goto(`${BASE}/`)
  await page.waitForSelector('footer', { timeout: 8000 })
  const footerText = page.locator('footer').textContent() ?? ''
  expect(footerText.length).toBeGreaterThan(10)
  const copyrightKeywords = ['©', 'rap', 'Rap', 'rapbeats', 'Rap Beats', '2026']
  const hasCopyright = copyrightKeywords.some(k => footerText.includes(k))
  expect(hasCopyright).toBe(true)
})
