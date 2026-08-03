import { useAuthStore } from '@/stores/auth'
import router from '@/router'

interface RequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const authStore = useAuthStore()
  const body = options.body as BodyInit | null | undefined
  const isFormData = body instanceof FormData || 
    (typeof body === 'object' && body !== null && (body as any).constructor?.name === 'FormData')

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers
  }

  if (authStore.token) {
    headers['Authorization'] = `Bearer ${authStore.token}`
  }

  const res = await fetch(url, {
    ...options,
    body,
    headers,
    credentials: 'include'
  })

  if (res.status === 401) {
    // 只有已登录用户才处理 401
    if (authStore.isAuthenticated) {
      authStore.logout()
      router.push('/login')
    }
    throw new Error('未授权，请重新登录')
  }

  if (!res.ok) {
    let message = `请求失败: ${res.status}`
    try {
      const errorData = await res.json()
      if (errorData.error || errorData.message) {
        message = errorData.error || errorData.message
      }
    } catch {
      // ignore parse error
    }
    throw new Error(message)
  }

  return res.json()
}

/**
 * Build a URL with auth token as query param for resources that need
 * authentication (like audio streams and downloads) since we can't set
 * headers on <audio> elements or direct <a> downloads.
 */
export function getAuthUrl(path: string): string {
  const authStore = useAuthStore()
  const url = new URL(path, window.location.origin)
  if (authStore.token) {
    url.searchParams.set('token', authStore.token)
  }
  return url.pathname + url.search
}
