<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchHomeFooter, subscribeToNewsletter } from '@/api/homeFooter'
import type { ChartBeat, FooterFaq, FooterLinkGroup, HomeCharts, HomeFooterConfig, HomeRapper } from '@/api/homeFooter'
import { vipPlanConfig } from '@/constants/vip'

const config = ref<HomeFooterConfig | null>(null)
const faqs = ref<FooterFaq[]>([])
const rappers = ref<HomeRapper[]>([])
const charts = ref<HomeCharts>({ downloads: [], favorites: [], plays: [] })
const expandedFaq = ref<number | null>(null)
const chartTab = ref<'downloads' | 'favorites' | 'plays'>('downloads')
const subscribeEmail = ref('')
const subscribeStatus = ref('')
const subscribeLoading = ref(false)

const vipPlans = ['basic', 'premium', 'ultimate'] as const

const chartTabs = [
  { key: 'downloads', label: '下载榜' },
  { key: 'favorites', label: '收藏榜' },
  { key: 'plays', label: '播放榜' }
] as const

const groupLabels: Record<FooterLinkGroup, string> = {
  quick: '快速导航',
  service: '平台服务',
  community: '社区',
  support: '支持'
}

const activeChartBeats = computed<ChartBeat[]>(() => charts.value[chartTab.value] ?? [])
const groupedLinks = computed(() => {
  const groups = new Map<FooterLinkGroup, { label: string; links: typeof config.value.links }>()
  for (const link of config.value?.links ?? []) {
    if (!groups.has(link.group)) groups.set(link.group, { label: groupLabels[link.group], links: [] })
    groups.get(link.group)!.links.push(link)
  }
  return Array.from(groups.values())
})

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function toggleFaq(id: number) {
  expandedFaq.value = expandedFaq.value === id ? null : id
}

function chartMetric(beat: ChartBeat): string {
  if (chartTab.value === 'favorites') return `${beat.favorite_count ?? 0} 收藏`
  if (chartTab.value === 'plays') return `${beat.play_count ?? 0} 播放`
  return `${beat.download_count ?? 0} 下载`
}

// 人气播放量格式化（>10000 显示 X.X 万）
function formatRapperPlays(n: number): string {
  if (!n) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  return String(n)
}

async function handleSubscribe() {
  const email = subscribeEmail.value.trim()
  if (!email) {
    subscribeStatus.value = '请输入邮箱地址'
    return
  }
  subscribeLoading.value = true
  subscribeStatus.value = ''
  try {
    const data = await subscribeToNewsletter(email)
    subscribeStatus.value = data.message
    if (data.message === '订阅成功' || data.message === '您已订阅，无需重复订阅') {
      subscribeEmail.value = ''
    }
  } catch (error: any) {
    subscribeStatus.value = error.message || '订阅失败，请稍后再试'
  } finally {
    subscribeLoading.value = false
  }
}

onMounted(async () => {
  try {
    const data = await fetchHomeFooter()
    config.value = data.config
    faqs.value = data.faqs
    rappers.value = data.rappers ?? []
    charts.value = data.charts ?? { downloads: [], favorites: [], plays: [] }
  } catch (error) {
    console.error('Failed to load home footer:', error)
  }
})
</script>

<template>
  <footer v-if="config" class="home-footer">
    <section v-if="config.creatorCta.isActive" class="creator-cta">
      <div class="creator-cta-copy">
        <h2>{{ config.creatorCta.title }}</h2>
        <p>{{ config.creatorCta.subtitle }}</p>
      </div>
      <router-link :to="config.creatorCta.buttonUrl || '/upload'" class="creator-cta-btn">{{ config.creatorCta.buttonText }}</router-link>
    </section>

    <section v-if="config.membershipSection.isActive" class="membership-section">
      <div class="footer-section-title">
        <h2>{{ config.membershipSection.title }}</h2>
        <p>{{ config.membershipSection.subtitle }}</p>
      </div>
      <div class="membership-grid">
        <div v-for="level in vipPlans" :key="level" class="membership-plan">
          <h3>{{ vipPlanConfig[level].label }}</h3>
          <div class="plan-price">
            <span class="currency">¥</span>{{ vipPlanConfig[level].price }}<span class="cycle">/{{ vipPlanConfig[level].cycleLabel }}</span>
          </div>
          <ul class="plan-benefits">
            <li v-for="benefit in vipPlanConfig[level].benefits" :key="benefit">{{ benefit }}</li>
          </ul>
          <router-link to="/vip" class="plan-cta">立即开通</router-link>
        </div>
      </div>
    </section>

    <section v-if="config.rappersSection.isActive && rappers.length" class="rappers-section">
      <div class="footer-section-title">
        <h2>{{ config.rappersSection.title }}</h2>
        <p>{{ config.rappersSection.subtitle }}</p>
      </div>
      <div class="rappers-grid">
        <router-link v-for="rapper in rappers" :key="rapper.id" :to="`/rapper/${rapper.id}`" class="rapper-chip">
          <span class="rapper-avatar">
            <img v-if="rapper.avatar_url" :src="rapper.avatar_url" :alt="rapper.name" />
            <span v-else>{{ rapper.name.charAt(0) }}</span>
          </span>
          <span class="rapper-meta">
            <strong>{{ rapper.name }}</strong>
            <small v-if="rapper.total_plays > 0">🔥 {{ formatRapperPlays(rapper.total_plays) }} 播放 · {{ rapper.beat_count }} 首作品</small>
            <small v-else>{{ rapper.beat_count }} 首作品</small>
          </span>
        </router-link>
      </div>
    </section>

    <section v-if="config.chartsSection.isActive" class="charts-section">
      <div class="footer-section-title charts-title">
        <div>
          <h2>{{ config.chartsSection.title }}</h2>
          <p>{{ config.chartsSection.subtitle }}</p>
        </div>
        <div class="chart-tabs">
          <button
            v-for="tab in chartTabs"
            :key="tab.key"
            type="button"
            class="chart-tab"
            :class="{ active: chartTab === tab.key }"
            @click="chartTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
      <div class="chart-list">
        <router-link v-for="(beat, index) in activeChartBeats" :key="beat.id" :to="`/beats/${beat.id}`" class="chart-item">
          <span class="chart-rank" :class="{ top: index < 3 }">{{ index + 1 }}</span>
          <span class="chart-cover">
            <img v-if="beat.cover_image" :src="beat.cover_image" :alt="beat.title" />
            <span v-else class="chart-cover-empty">♪</span>
          </span>
          <span class="chart-info">
            <strong>{{ beat.title }}</strong>
            <small>{{ beat.producer }}</small>
          </span>
          <span class="chart-metric">{{ chartMetric(beat) }}</span>
        </router-link>
      </div>
    </section>

    <section v-if="faqs.length" class="footer-faq">
      <div class="footer-section-title">
        <h2>常见问题</h2>
      </div>
      <div class="faq-list">
        <div v-for="faq in faqs" :key="faq.id" class="faq-item" :class="{ open: expandedFaq === faq.id }">
          <button type="button" class="faq-question" @click="toggleFaq(faq.id)">
            <span>{{ faq.question }}</span>
            <span class="faq-toggle">{{ expandedFaq === faq.id ? '−' : '+' }}</span>
          </button>
          <div v-if="expandedFaq === faq.id" class="faq-answer">{{ faq.answer }}</div>
        </div>
      </div>
    </section>

    <section v-if="config.subscribeSection.isActive" class="subscribe-section">
      <div class="subscribe-copy">
        <h2>{{ config.subscribeSection.title }}</h2>
        <p>{{ config.subscribeSection.subtitle }}</p>
      </div>
      <form class="subscribe-form" @submit.prevent="handleSubscribe">
        <input v-model="subscribeEmail" type="email" placeholder="输入你的邮箱" />
        <button type="submit" :disabled="subscribeLoading">{{ subscribeLoading ? '提交中...' : config.subscribeSection.buttonText }}</button>
      </form>
      <p v-if="subscribeStatus" class="subscribe-status">{{ subscribeStatus }}</p>
    </section>

    <div class="footer-bottom">
      <div v-if="groupedLinks.length" class="footer-link-groups">
        <div v-for="group in groupedLinks" :key="group.label" class="footer-link-group">
          <h4>{{ group.label }}</h4>
          <template v-for="link in group.links" :key="link.id">
            <a v-if="isExternal(link.url)" :href="link.url" target="_blank" rel="noopener">{{ link.label }}</a>
            <router-link v-else :to="link.url || '#'">{{ link.label }}</router-link>
          </template>
        </div>
      </div>

      <div class="footer-compliance">
        <p class="copyright">{{ config.compliance.copyrightText }}</p>
        <div v-if="config.compliance.icp || config.compliance.police" class="beian">
          <a v-if="config.compliance.icp" :href="config.compliance.icpUrl || '#'" target="_blank" rel="noopener">{{ config.compliance.icp }}</a>
          <a v-if="config.compliance.police" :href="config.compliance.policeUrl || '#'" target="_blank" rel="noopener">{{ config.compliance.police }}</a>
        </div>
        <a v-if="config.compliance.email" class="contact-email" :href="`mailto:${config.compliance.email}`">{{ config.compliance.emailLabel }}：{{ config.compliance.email }}</a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.home-footer {
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
  padding: 48px 32px 32px;
  margin-top: 64px;
}

.footer-faq,
.creator-cta,
.membership-section,
.rappers-section,
.charts-section,
.subscribe-section,
.footer-bottom {
  max-width: 1120px;
  margin-left: auto;
  margin-right: auto;
}

.footer-section-title {
  margin-bottom: 20px;
}

.footer-section-title h2,
.creator-cta h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.footer-section-title p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.creator-cta {
  margin-top: 48px;
  padding: 28px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent-light), transparent);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.creator-cta p {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.creator-cta-btn {
  flex-shrink: 0;
  padding: 11px 20px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.creator-cta-btn:hover {
  background: var(--accent-hover);
}

.footer-faq {
  margin-top: 48px;
}

.faq-list {
  border-top: 1px solid var(--border);
}

.faq-item {
  border-bottom: 1px solid var(--border);
}

.faq-question {
  width: 100%;
  padding: 16px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: transparent;
  border: 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.faq-toggle {
  color: var(--text-secondary);
  font-size: 18px;
}

.faq-answer {
  padding: 0 0 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.footer-bottom {
  margin-top: 48px;
  padding-top: 28px;
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 32px;
  align-items: start;
}

.footer-link-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 28px;
}

.footer-link-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.footer-link-group h4 {
  margin: 0 0 2px;
  font-size: 13px;
  color: var(--text-primary);
}

.footer-link-group a {
  font-size: 13px;
  color: var(--text-secondary);
  text-decoration: none;
}

.footer-link-group a:hover {
  color: var(--accent);
}

.footer-compliance {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.copyright {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.beian {
  display: flex;
  gap: 14px;
}

.beian a,
.contact-email {
  font-size: 12px;
  color: var(--text-secondary);
  text-decoration: none;
}

.beian a:hover,
.contact-email:hover {
  color: var(--accent);
}

.membership-section,
.rappers-section,
.charts-section {
  margin-top: 48px;
}

.membership-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.membership-plan {
  display: flex;
  flex-direction: column;
  padding: 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
}

.membership-plan h3 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.plan-price {
  margin-bottom: 16px;
  font-size: 32px;
  font-weight: 800;
  color: var(--text-primary);
}

.plan-price .currency {
  margin-right: 2px;
  font-size: 18px;
}

.plan-price .cycle {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.plan-benefits {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 20px;
  padding: 0;
  list-style: none;
}

.plan-benefits li {
  position: relative;
  padding-left: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.plan-benefits li::before {
  position: absolute;
  top: 6px;
  left: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  content: '';
}

.plan-cta {
  display: block;
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  background: var(--accent-light);
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  text-decoration: none;
}

.plan-cta:hover {
  background: var(--accent);
  color: #fff;
}

.rappers-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.rapper-chip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  text-decoration: none;
}

.rapper-chip:hover {
  border-color: var(--accent);
}

.rapper-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 700;
}

.rapper-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rapper-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.rapper-meta strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rapper-meta small {
  color: var(--text-secondary);
  font-size: 12px;
}

.charts-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.chart-tabs {
  display: flex;
  gap: 6px;
}

.chart-tab {
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.chart-tab.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}

.chart-list {
  display: flex;
  flex-direction: column;
}

.chart-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  text-decoration: none;
}

.chart-item:last-child {
  border-bottom: 0;
}

.chart-rank {
  width: 24px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 700;
  text-align: center;
}

.chart-rank.top {
  color: var(--accent);
}

.chart-cover {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--accent);
}

.chart-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chart-info {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.chart-info strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-info small {
  color: var(--text-secondary);
  font-size: 12px;
}

.chart-metric {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.subscribe-section {
  margin-top: 48px;
  padding: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent-light), transparent);
}

.subscribe-copy h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.subscribe-copy p {
  margin: 6px 0 18px;
  font-size: 14px;
  color: var(--text-secondary);
}

.subscribe-form {
  display: flex;
  max-width: 480px;
  gap: 10px;
}

.subscribe-form input {
  flex: 1;
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.subscribe-form input:focus {
  border-color: var(--accent);
}

.subscribe-form button {
  padding: 11px 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.subscribe-form button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.subscribe-status {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

@media (max-width: 860px) {
  .home-footer {
    padding: 32px 20px 24px;
  }

  .membership-grid,
  .rappers-grid {
    grid-template-columns: 1fr;
  }

  .creator-cta {
    flex-direction: column;
    align-items: flex-start;
  }

  .charts-title {
    flex-direction: column;
    align-items: flex-start;
  }

  .subscribe-form {
    flex-direction: column;
  }

  .footer-bottom {
    grid-template-columns: 1fr;
  }

  .footer-compliance {
    align-items: flex-start;
    text-align: left;
  }
}
</style>
