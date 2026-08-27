import { request } from './request'

export type FooterLinkGroup = 'quick' | 'service' | 'community' | 'support'

export interface FooterLink {
  id: string
  label: string
  url: string
  group: FooterLinkGroup
}

export interface LicenseCard {
  id: string
  icon: string
  title: string
  description: string
  ctaText: string
  ctaUrl: string
  sortOrder: number
  isActive: boolean
}

export interface CreatorCta {
  title: string
  subtitle: string
  buttonText: string
  buttonUrl: string
  isActive: boolean
}

export type FooterStatAuto = 'none' | 'totalBeats' | 'totalRappers' | 'totalDownloads' | 'totalUsers'

export interface FooterStat {
  id: string
  label: string
  value: string
  auto: FooterStatAuto
  sortOrder: number
  isActive: boolean
}

export interface FooterCompliance {
  copyrightText: string
  icp: string
  icpUrl: string
  police: string
  policeUrl: string
  email: string
  emailLabel: string
}

export interface SectionSettings {
  isActive: boolean
  title: string
  subtitle: string
}

export interface RappersSection extends SectionSettings {
  count: number
}

export interface ChartsSection extends SectionSettings {
  count: number
}

export interface SubscribeSection extends SectionSettings {
  buttonText: string
}

export interface HomeFooterConfig {
  licenseCards: LicenseCard[]
  creatorCta: CreatorCta
  stats: FooterStat[]
  links: FooterLink[]
  compliance: FooterCompliance
  membershipSection: SectionSettings
  rappersSection: RappersSection
  chartsSection: ChartsSection
  subscribeSection: SubscribeSection
}

export interface FooterFaq {
  id: number
  category: string
  question: string
  answer: string
  sort_order: number
  is_active: number
  created_at?: string
  updated_at?: string
}

export interface HomeRapper {
  id: number
  name: string
  avatar_url: string | null
  bio: string | null
  beat_count: number
}

export interface ChartBeat {
  id: number
  title: string
  producer: string
  genre: string
  bpm: number
  key: string
  duration: number
  cover_image: string | null
  is_free: boolean
  is_vip_only: boolean
  download_count: number
  favorite_count?: number
  play_count?: number
  created_at: string
}

export interface HomeCharts {
  downloads: ChartBeat[]
  favorites: ChartBeat[]
  plays: ChartBeat[]
}

export interface Subscription {
  id: number
  email: string
  source: string
  is_active: number
  created_at: string
}

export async function fetchHomeFooter() {
  return request<{ config: HomeFooterConfig | null; faqs: FooterFaq[]; rappers: HomeRapper[]; charts: HomeCharts }>('/api/home/footer')
}

export async function fetchAdminHomeFooter() {
  return request<{ config: HomeFooterConfig | null; faqs: FooterFaq[] }>('/api/admin/home-footer')
}

export async function updateHomeFooterConfig(config: HomeFooterConfig) {
  return request<{ config: HomeFooterConfig }>('/api/admin/home-footer/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  })
}

export async function createFaq(data: { category: string; question: string; answer: string; sort_order: number; is_active: number }) {
  return request<{ faq: FooterFaq }>('/api/admin/home-footer/faqs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function updateFaq(id: number, data: { category: string; question: string; answer: string; sort_order: number; is_active: number }) {
  return request<{ faq: FooterFaq }>(`/api/admin/home-footer/faqs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export async function deleteFaq(id: number) {
  return request(`/api/admin/home-footer/faqs/${id}`, { method: 'DELETE' })
}

export async function reorderFaqs(items: { id: number; sort_order: number }[]) {
  return request('/api/admin/home-footer/faqs/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  })
}

export async function subscribeToNewsletter(email: string) {
  return request<{ message: string }>('/api/home/footer/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  })
}

export async function fetchAdminSubscriptions() {
  return request<{ subscriptions: Subscription[] }>('/api/admin/home-footer/subscriptions')
}

export async function deleteSubscription(id: number) {
  return request(`/api/admin/home-footer/subscriptions/${id}`, { method: 'DELETE' })
}
