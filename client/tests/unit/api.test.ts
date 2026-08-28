/**
 * client/tests/unit/api.test.ts
 * 测试 api/homeFooter.ts 的 API 调用 — 通过 mock fetch 验证参数与方法
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

// 全局 mock fetch（api/request 内部用 fetch）
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function mockFetchOnce(data: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as any)
}

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock.mockReset()
  try {
    if (typeof localStorage?.clear === 'function') localStorage.clear();
  } catch {}
})

afterEach(() => {
  try {
    if (typeof localStorage?.clear === 'function') localStorage.clear();
  } catch {}
})

describe('homeFooter API', () => {
  it('TC-CLIENT-HF-001 fetchHomeFooter 调用 GET /api/home/footer', async () => {
    mockFetchOnce({ config: null, faqs: [], rappers: [], charts: { downloads: [], favorites: [], plays: [] } })
    const { fetchHomeFooter } = await import('@/api/homeFooter')
    const res = await fetchHomeFooter()
    expect(res).toHaveProperty('config')
    expect(res).toHaveProperty('faqs')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/home/footer',
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('TC-CLIENT-HF-002 updateHomeFooterConfig PUT 到 /api/admin/home-footer/config', async () => {
    const auth = useAuthStore()
    auth.token = 't123'
    auth.user = { id: 1, username: 'admin', email: 'a@a.com', role: 'admin', vip_level: 'free', is_vip: 0, is_beatmaker: 0 } as any
    mockFetchOnce({ config: {} as any })

    const { updateHomeFooterConfig } = await import('@/api/homeFooter')
    await updateHomeFooterConfig({
      licenseCards: [],
      creatorCta: { title: '', subtitle: '', buttonText: '', buttonUrl: '', isActive: true },
      stats: [],
      links: [],
      compliance: { copyrightText: '', icp: '', icpUrl: '', police: '', policeUrl: '', email: '', emailLabel: '' },
      membershipSection: { isActive: true, title: '', subtitle: '' },
      rappersSection: { isActive: true, title: '', subtitle: '', count: 6 },
      chartsSection: { isActive: true, title: '', subtitle: '', count: 5 },
      subscribeSection: { isActive: true, title: '', subtitle: '', buttonText: '' },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/home-footer/config',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      })
    )
  })

  it('TC-CLIENT-HF-003 subscribeToNewsletter 校验', async () => {
    mockFetchOnce({ message: '订阅成功' })
    const { subscribeToNewsletter } = await import('@/api/homeFooter')
    const res = await subscribeToNewsletter('test@test.com')
    expect(res.message).toContain('订阅')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/home/footer/subscribe',
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('beatmaker API', () => {
  it('TC-CLIENT-BM-001 fetchBeatmakerList GET /api/beatmaker/list', async () => {
    mockFetchOnce({ beatmakers: [] })
    const { fetchBeatmakerList } = await import('@/api/beatmaker')
    const res = await fetchBeatmakerList()
    expect(Array.isArray(res.beatmakers)).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/beatmaker/list', expect.anything())
  })

  it('TC-CLIENT-BM-002 submitBeatmakerApplication POST 携带 token', async () => {
    const auth = useAuthStore()
    auth.token = 't123'
    auth.user = { id: 1, username: 'u', email: 'u@u.com', role: 'user', vip_level: 'free', is_vip: 0, is_beatmaker: 0 } as any
    mockFetchOnce({ message: '申请已提交', application_id: 42 })

    const { submitBeatmakerApplication } = await import('@/api/beatmaker')
    await submitBeatmakerApplication({
      real_name: '张三',
      id_card_no: '110101199001011234',
      portfolio_url: 'https://example.com',
      sample_work_url: 'https://example.com/s',
      bio: '啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊',
    })

    const call = fetchMock.mock.calls[0]
    expect(call[0]).toBe('/api/beatmaker/apply')
    expect(call[1].method).toBe('POST')
    expect(call[1].headers.Authorization).toBe('Bearer t123')
  })
})

describe('beats API', () => {
  it('TC-CLIENT-BEATS-001 fetchHomePublicData GET /api/home/public', async () => {
    mockFetchOnce({
      latest: { beats: [], total: 0, page: 1 },
      popular: { beats: [], total: 0, page: 1 },
      free: { beats: [], total: 0, page: 1 },
      rappers: [],
      tags: [],
      forumPosts: [],
    })
    const { fetchHomePublicData } = await import('@/api/beats')
    const res = await fetchHomePublicData()
    expect(res).toHaveProperty('rappers')
    expect(res).toHaveProperty('tags')
    expect(res).toHaveProperty('forumPosts')
  })

  it('TC-CLIENT-BEATS-002 fetchBeats 携带 tag 参数', async () => {
    mockFetchOnce({ beats: [], total: 0, page: 1 })
    const { fetchBeats } = await import('@/api/beats')
    await fetchBeats({ tag: 'Trap', limit: 5 })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/beats'),
      expect.anything()
    )
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('tag=Trap')
  })
})
