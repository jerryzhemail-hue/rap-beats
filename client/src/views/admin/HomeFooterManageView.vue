<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  createFaq,
  deleteFaq,
  deleteSubscription,
  fetchAdminHomeFooter,
  fetchAdminSubscriptions,
  reorderFaqs,
  updateFaq,
  updateHomeFooterConfig
} from '@/api/homeFooter'
import type { FooterFaq, FooterLinkGroup, FooterStatAuto, HomeFooterConfig, Subscription } from '@/api/homeFooter'

type TabKey = 'license' | 'cta' | 'membership' | 'rappers' | 'charts' | 'stats' | 'links' | 'compliance' | 'faqs' | 'subscriptions'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'license', label: '授权卡片' },
  { key: 'cta', label: '入驻 CTA' },
  { key: 'membership', label: '会员权益' },
  { key: 'rappers', label: '热门制作人' },
  { key: 'charts', label: '热门榜单' },
  { key: 'stats', label: '数据背书' },
  { key: 'links', label: '底部链接' },
  { key: 'compliance', label: '合规信息' },
  { key: 'faqs', label: '常见问题' },
  { key: 'subscriptions', label: '订阅列表' }
]

const statAutoOptions: { value: FooterStatAuto; label: string }[] = [
  { value: 'none', label: '手动填写' },
  { value: 'totalBeats', label: '自动：Beat 数量' },
  { value: 'totalRappers', label: '自动：制作人数量' },
  { value: 'totalDownloads', label: '自动：累计下载' },
  { value: 'totalUsers', label: '自动：注册用户' }
]

const linkGroupOptions: { value: FooterLinkGroup; label: string }[] = [
  { value: 'quick', label: '快速导航' },
  { value: 'service', label: '平台服务' },
  { value: 'community', label: '社区' },
  { value: 'support', label: '支持' }
]

const activeTab = ref<TabKey>('license')
const config = ref<HomeFooterConfig | null>(null)
const faqs = ref<FooterFaq[]>([])
const subscriptions = ref<Subscription[]>([])
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const subscriptionsLoading = ref(false)

const faqModalVisible = ref(false)
const faqSaving = ref(false)
const faqForm = ref({
  id: null as number | null,
  category: '通用',
  question: '',
  answer: '',
  sort_order: 0,
  is_active: 1
})

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function showMessage(text: string) {
  message.value = text
  window.setTimeout(() => {
    if (message.value === text) message.value = ''
  }, 2200)
}

function formatTime(value: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

async function load() {
  loading.value = true
  try {
    const data = await fetchAdminHomeFooter()
    config.value = data.config ? clone(data.config) : null
    faqs.value = clone(data.faqs)
  } catch (error: any) {
    alert(error.message || '加载失败')
  } finally {
    loading.value = false
  }
  loadSubscriptions()
}

async function loadSubscriptions() {
  subscriptionsLoading.value = true
  try {
    const data = await fetchAdminSubscriptions()
    subscriptions.value = clone(data.subscriptions)
  } catch (error: any) {
    console.error('Failed to load subscriptions:', error)
  } finally {
    subscriptionsLoading.value = false
  }
}

async function handleDeleteSubscription(subscription: Subscription) {
  const confirmed = window.confirm(`确定删除订阅邮箱「${subscription.email}」吗？`)
  if (!confirmed) return
  try {
    await deleteSubscription(subscription.id)
    await loadSubscriptions()
  } catch (error: any) {
    alert(error.message || '删除失败')
  }
}

async function saveConfig() {
  if (!config.value) return
  saving.value = true
  try {
    await updateHomeFooterConfig(config.value)
    showMessage('配置已保存')
  } catch (error: any) {
    alert(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function addLicenseCard() {
  config.value?.licenseCards.push({
    id: `card-${Date.now()}`,
    icon: '🎵',
    title: '新授权方式',
    description: '',
    ctaText: '了解详情',
    ctaUrl: '',
    sortOrder: config.value.licenseCards.length + 1,
    isActive: true
  })
}

function removeLicenseCard(index: number) {
  config.value?.licenseCards.splice(index, 1)
}

function moveLicenseCard(index: number, direction: -1 | 1) {
  if (!config.value) return
  const target = index + direction
  if (target < 0 || target >= config.value.licenseCards.length) return
  const items = config.value.licenseCards
  const [moved] = items.splice(index, 1)
  items.splice(target, 0, moved)
  items.forEach((item, i) => (item.sortOrder = i + 1))
}

function addStat() {
  config.value?.stats.push({
    id: `stat-${Date.now()}`,
    label: '新指标',
    value: '',
    auto: 'none',
    sortOrder: config.value.stats.length + 1,
    isActive: true
  })
}

function removeStat(index: number) {
  config.value?.stats.splice(index, 1)
}

function moveStat(index: number, direction: -1 | 1) {
  if (!config.value) return
  const target = index + direction
  if (target < 0 || target >= config.value.stats.length) return
  const items = config.value.stats
  const [moved] = items.splice(index, 1)
  items.splice(target, 0, moved)
  items.forEach((item, i) => (item.sortOrder = i + 1))
}

function addLink() {
  config.value?.links.push({ id: `link-${Date.now()}`, label: '新链接', url: '/', group: 'quick' })
}

function removeLink(index: number) {
  config.value?.links.splice(index, 1)
}

function openCreateFaq() {
  faqForm.value = { id: null, category: '通用', question: '', answer: '', sort_order: faqs.value.length, is_active: 1 }
  faqModalVisible.value = true
}

function openEditFaq(faq: FooterFaq) {
  faqForm.value = {
    id: faq.id,
    category: faq.category,
    question: faq.question,
    answer: faq.answer,
    sort_order: faq.sort_order,
    is_active: faq.is_active
  }
  faqModalVisible.value = true
}

async function saveFaq() {
  if (!faqForm.value.question.trim() || !faqForm.value.answer.trim()) {
    alert('请填写问题和答案')
    return
  }
  faqSaving.value = true
  try {
    const payload = {
      category: faqForm.value.category.trim() || '通用',
      question: faqForm.value.question.trim(),
      answer: faqForm.value.answer.trim(),
      sort_order: faqForm.value.sort_order,
      is_active: faqForm.value.is_active
    }
    if (faqForm.value.id) {
      await updateFaq(faqForm.value.id, payload)
    } else {
      await createFaq(payload)
    }
    faqModalVisible.value = false
    await load()
  } catch (error: any) {
    alert(error.message || '保存失败')
  } finally {
    faqSaving.value = false
  }
}

async function handleDeleteFaq(faq: FooterFaq) {
  const confirmed = window.confirm(`确定删除 FAQ「${faq.question}」吗？`)
  if (!confirmed) return
  try {
    await deleteFaq(faq.id)
    await load()
  } catch (error: any) {
    alert(error.message || '删除失败')
  }
}

async function persistFaqOrder() {
  await reorderFaqs(faqs.value.map((item, index) => ({ id: item.id, sort_order: index })))
  showMessage('FAQ 排序已保存')
}

async function moveFaq(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= faqs.value.length) return
  const [moved] = faqs.value.splice(index, 1)
  faqs.value.splice(target, 0, moved)
  await persistFaqOrder()
}

onMounted(load)
</script>

<template>
  <div class="footer-manage">
    <div class="toolbar">
      <div class="toolbar-copy">
        <h2>首页尾部内容管理</h2>
        <p>配置 PC 端首页尾部的授权说明、入驻入口、数据背书、底部导航、合规信息与常见问题。</p>
      </div>
      <button v-if="activeTab !== 'faqs' && activeTab !== 'subscriptions'" class="btn-primary" :disabled="saving || !config" @click="saveConfig">
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
      <span v-if="message" class="save-message">{{ message }}</span>
    </div>

    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="loading" class="loading-hint">加载中...</div>

    <div v-else-if="config" class="tab-content">
      <!-- 授权卡片 -->
      <div v-if="activeTab === 'license'" class="panel">
        <div class="panel-header">
          <div>
            <h3>授权方式卡片</h3>
            <p>通常为：个人非商用 / 商用 License / 独家买断。</p>
          </div>
          <button class="btn-ghost" @click="addLicenseCard">+ 新增卡片</button>
        </div>
        <div v-for="(card, index) in config.licenseCards" :key="card.id" class="editable-block">
          <div class="block-head">
            <span>卡片 {{ index + 1 }}</span>
            <div class="block-actions">
              <button class="btn-icon" title="上移" @click="moveLicenseCard(index, -1)">↑</button>
              <button class="btn-icon" title="下移" @click="moveLicenseCard(index, 1)">↓</button>
              <button class="btn-icon danger" title="删除" @click="removeLicenseCard(index)">×</button>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-item narrow">
              <label>图标</label>
              <input v-model="card.icon" class="form-input" placeholder="🎧" />
            </div>
            <div class="form-item">
              <label>标题</label>
              <input v-model="card.title" class="form-input" />
            </div>
            <div class="form-item">
              <label>按钮文案</label>
              <input v-model="card.ctaText" class="form-input" />
            </div>
            <div class="form-item">
              <label>按钮链接</label>
              <input v-model="card.ctaUrl" class="form-input" placeholder="/vip" />
            </div>
            <div class="form-item form-span-2">
              <label>描述</label>
              <textarea v-model="card.description" class="form-textarea" rows="2"></textarea>
            </div>
            <div class="form-item">
              <label class="checkbox-label">
                <input v-model="card.isActive" type="checkbox" />
                <span>启用</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- 入驻 CTA -->
      <div v-else-if="activeTab === 'cta'" class="panel">
        <div class="panel-header">
          <div>
            <h3>制作人入驻入口</h3>
            <p>引导 Beatmaker 上传作品，加入 Rapper 频道。</p>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-item">
            <label>标题</label>
            <input v-model="config.creatorCta.title" class="form-input" />
          </div>
          <div class="form-item">
            <label>按钮文案</label>
            <input v-model="config.creatorCta.buttonText" class="form-input" />
          </div>
          <div class="form-item form-span-2">
            <label>副标题</label>
            <input v-model="config.creatorCta.subtitle" class="form-input" />
          </div>
          <div class="form-item">
            <label>按钮链接</label>
            <input v-model="config.creatorCta.buttonUrl" class="form-input" placeholder="/upload" />
          </div>
          <div class="form-item">
            <label class="checkbox-label">
              <input v-model="config.creatorCta.isActive" type="checkbox" />
              <span>启用该入口</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 会员权益 -->
      <div v-else-if="activeTab === 'membership'" class="panel">
        <div class="panel-header">
          <div>
            <h3>会员权益区块</h3>
            <p>权益明细沿用会员配置，这里控制区块标题、副标题与展示开关。</p>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-item">
            <label>标题</label>
            <input v-model="config.membershipSection.title" class="form-input" />
          </div>
          <div class="form-item">
            <label>副标题</label>
            <input v-model="config.membershipSection.subtitle" class="form-input" />
          </div>
          <div class="form-item">
            <label class="checkbox-label">
              <input v-model="config.membershipSection.isActive" type="checkbox" />
              <span>启用该区块</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 热门制作人 -->
      <div v-else-if="activeTab === 'rappers'" class="panel">
        <div class="panel-header">
          <div>
            <h3>热门制作人区块</h3>
            <p>数据按作品数量自动排序，这里控制展示数量与文案。</p>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-item">
            <label>标题</label>
            <input v-model="config.rappersSection.title" class="form-input" />
          </div>
          <div class="form-item">
            <label>副标题</label>
            <input v-model="config.rappersSection.subtitle" class="form-input" />
          </div>
          <div class="form-item">
            <label>展示数量</label>
            <input v-model.number="config.rappersSection.count" type="number" min="3" max="12" class="form-input" />
          </div>
          <div class="form-item">
            <label class="checkbox-label">
              <input v-model="config.rappersSection.isActive" type="checkbox" />
              <span>启用该区块</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 热门榜单 -->
      <div v-else-if="activeTab === 'charts'" class="panel">
        <div class="panel-header">
          <div>
            <h3>热门榜单区块</h3>
            <p>下载 / 收藏 / 播放三个榜单，控制展示数量与文案。</p>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-item">
            <label>标题</label>
            <input v-model="config.chartsSection.title" class="form-input" />
          </div>
          <div class="form-item">
            <label>副标题</label>
            <input v-model="config.chartsSection.subtitle" class="form-input" />
          </div>
          <div class="form-item">
            <label>每榜数量</label>
            <input v-model.number="config.chartsSection.count" type="number" min="3" max="10" class="form-input" />
          </div>
          <div class="form-item">
            <label class="checkbox-label">
              <input v-model="config.chartsSection.isActive" type="checkbox" />
              <span>启用该区块</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 数据背书 -->
      <div v-else-if="activeTab === 'stats'" class="panel">
        <div class="panel-header">
          <div>
            <h3>数据背书指标</h3>
            <p>可选择自动统计，或手动填写展示数值。</p>
          </div>
          <button class="btn-ghost" @click="addStat">+ 新增指标</button>
        </div>
        <div v-for="(stat, index) in config.stats" :key="stat.id" class="editable-block">
          <div class="block-head">
            <span>指标 {{ index + 1 }}</span>
            <div class="block-actions">
              <button class="btn-icon" title="上移" @click="moveStat(index, -1)">↑</button>
              <button class="btn-icon" title="下移" @click="moveStat(index, 1)">↓</button>
              <button class="btn-icon danger" title="删除" @click="removeStat(index)">×</button>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-item">
              <label>标签</label>
              <input v-model="stat.label" class="form-input" />
            </div>
            <div class="form-item">
              <label>数值来源</label>
              <select v-model="stat.auto" class="form-input">
                <option v-for="opt in statAutoOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div v-if="stat.auto === 'none'" class="form-item">
              <label>手动数值</label>
              <input v-model="stat.value" class="form-input" />
            </div>
            <div class="form-item">
              <label class="checkbox-label">
                <input v-model="stat.isActive" type="checkbox" />
                <span>启用</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部链接 -->
      <div v-else-if="activeTab === 'links'" class="panel">
        <div class="panel-header">
          <div>
            <h3>底部导航链接</h3>
            <p>分组展示，站内路径用 / 开头，外部地址用完整 URL。</p>
          </div>
          <button class="btn-ghost" @click="addLink">+ 新增链接</button>
        </div>
        <div v-for="(link, index) in config.links" :key="link.id" class="link-row">
          <input v-model="link.label" class="form-input" placeholder="名称" />
          <input v-model="link.url" class="form-input" placeholder="路径或 URL" />
          <select v-model="link.group" class="form-input">
            <option v-for="opt in linkGroupOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <button class="btn-icon danger" title="删除" @click="removeLink(index)">×</button>
        </div>
      </div>

      <!-- 合规信息 -->
      <div v-else-if="activeTab === 'compliance'" class="panel">
        <div class="panel-header">
          <div>
            <h3>合规与版权信息</h3>
            <p>备案号留空时前台不展示。</p>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-item form-span-2">
            <label>版权文案</label>
            <input v-model="config.compliance.copyrightText" class="form-input" />
          </div>
          <div class="form-item">
            <label>ICP 备案号</label>
            <input v-model="config.compliance.icp" class="form-input" placeholder="例如：京ICP备XXXX号" />
          </div>
          <div class="form-item">
            <label>ICP 链接</label>
            <input v-model="config.compliance.icpUrl" class="form-input" />
          </div>
          <div class="form-item">
            <label>公安备案号</label>
            <input v-model="config.compliance.police" class="form-input" />
          </div>
          <div class="form-item">
            <label>公安备案链接</label>
            <input v-model="config.compliance.policeUrl" class="form-input" />
          </div>
          <div class="form-item">
            <label>联系邮箱</label>
            <input v-model="config.compliance.email" class="form-input" />
          </div>
          <div class="form-item">
            <label>联系入口文案</label>
            <input v-model="config.compliance.emailLabel" class="form-input" />
          </div>
        </div>
      </div>

      <!-- FAQ -->
      <div v-else-if="activeTab === 'faqs'" class="panel">
        <div class="panel-header">
          <div>
            <h3>常见问题</h3>
            <p>支持上下调整顺序，排序保存后立即生效。</p>
          </div>
          <button class="btn-primary" @click="openCreateFaq">+ 新增 FAQ</button>
        </div>
        <table class="admin-table">
          <thead>
            <tr>
              <th>顺序</th>
              <th>分类</th>
              <th>问题</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="faqs.length === 0">
              <td colspan="5" class="empty-cell">暂无 FAQ</td>
            </tr>
            <tr v-for="(faq, index) in faqs" :key="faq.id">
              <td>
                <div class="inline-actions">
                  <button class="btn-icon" title="上移" @click="moveFaq(index, -1)">↑</button>
                  <button class="btn-icon" title="下移" @click="moveFaq(index, 1)">↓</button>
                </div>
              </td>
              <td>{{ faq.category }}</td>
              <td class="faq-question-cell">{{ faq.question }}</td>
              <td>
                <span class="status-badge" :class="{ active: faq.is_active }">{{ faq.is_active ? '启用' : '停用' }}</span>
              </td>
              <td>
                <div class="action-btns">
                  <button class="btn-sm btn-edit" @click="openEditFaq(faq)">编辑</button>
                  <button class="btn-sm btn-danger" @click="handleDeleteFaq(faq)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 订阅列表 -->
      <div v-else-if="activeTab === 'subscriptions'" class="panel">
        <div class="panel-header">
          <div>
            <h3>订阅列表</h3>
            <p>首页尾部收集的新 Beat 上架订阅邮箱。</p>
          </div>
        </div>
        <div v-if="subscriptionsLoading" class="loading-hint">加载中...</div>
        <table v-else class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>邮箱</th>
              <th>来源</th>
              <th>订阅时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="subscriptions.length === 0">
              <td colspan="5" class="empty-cell">暂无订阅</td>
            </tr>
            <tr v-for="sub in subscriptions" :key="sub.id">
              <td>{{ sub.id }}</td>
              <td>{{ sub.email }}</td>
              <td>{{ sub.source }}</td>
              <td>{{ formatTime(sub.created_at) }}</td>
              <td>
                <button class="btn-sm btn-danger" @click="handleDeleteSubscription(sub)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="faqModalVisible" class="modal-overlay" @click.self="faqModalVisible = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3>{{ faqForm.id ? '编辑 FAQ' : '新增 FAQ' }}</h3>
            <button class="modal-close" @click="faqModalVisible = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-item">
              <label>分类</label>
              <input v-model="faqForm.category" class="form-input" />
            </div>
            <div class="form-item">
              <label>问题</label>
              <input v-model="faqForm.question" class="form-input" />
            </div>
            <div class="form-item">
              <label>答案</label>
              <textarea v-model="faqForm.answer" class="form-textarea" rows="4"></textarea>
            </div>
            <div class="form-item">
              <label class="checkbox-label">
                <input v-model="faqForm.is_active" type="checkbox" :true-value="1" :false-value="0" />
                <span>启用</span>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" :disabled="faqSaving" @click="faqModalVisible = false">取消</button>
            <button class="btn-primary" :disabled="faqSaving" @click="saveFaq">{{ faqSaving ? '保存中...' : '保存' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.footer-manage {
  max-width: 1120px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
}

.toolbar-copy {
  flex: 1;
}

.toolbar-copy h2 {
  margin: 0 0 6px;
  color: #fff;
  font-size: 22px;
}

.toolbar-copy p {
  margin: 0;
  color: #a0a0b0;
  line-height: 1.6;
}

.save-message {
  color: #4ade80;
  font-size: 13px;
}

.btn-primary,
.btn-ghost,
.btn-cancel {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-primary {
  padding: 10px 16px;
  background: #7c3aed;
  color: #fff;
  font-size: 14px;
}

.btn-primary:hover {
  background: #9333ea;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-ghost {
  padding: 8px 14px;
  background: rgba(124, 58, 237, 0.15);
  color: #c4b5fd;
  font-size: 13px;
}

.btn-cancel {
  padding: 10px 16px;
  background: #2a2a45;
  color: #e0e0e8;
}

.tab-bar {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  border-bottom: 1px solid #2a2a45;
  padding-bottom: 12px;
}

.tab-btn {
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #a0a0b0;
  font-size: 13px;
  cursor: pointer;
}

.tab-btn:hover {
  color: #fff;
}

.tab-btn.active {
  background: rgba(124, 58, 237, 0.15);
  color: #c4b5fd;
  border-color: rgba(124, 58, 237, 0.4);
}

.loading-hint {
  padding: 60px 0;
  text-align: center;
  color: #a0a0b0;
}

.panel {
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 12px;
  padding: 20px;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.panel-header h3 {
  margin: 0 0 4px;
  color: #fff;
  font-size: 16px;
}

.panel-header p {
  margin: 0;
  color: #a0a0b0;
  font-size: 13px;
}

.editable-block {
  border: 1px solid #2a2a45;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 14px;
  background: #16162a;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  color: #e0e0e8;
  font-weight: 600;
  font-size: 13px;
}

.block-actions,
.inline-actions,
.action-btns {
  display: flex;
  gap: 6px;
  align-items: center;
}

.btn-icon {
  width: 26px;
  height: 26px;
  border: 1px solid #2a2a45;
  border-radius: 6px;
  background: #1a1a30;
  color: #c4b5fd;
  cursor: pointer;
}

.btn-icon.danger {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.3);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-item.narrow {
  max-width: 120px;
}

.form-span-2 {
  grid-column: span 2;
}

.form-item label {
  color: #a0a0b0;
  font-size: 12px;
}

.form-input,
.form-textarea,
.form-item select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  background: #12121f;
  color: #fff;
  font-size: 13px;
  outline: none;
}

.form-input:focus,
.form-textarea:focus,
.form-item select:focus {
  border-color: #7c3aed;
}

.form-textarea {
  resize: vertical;
  line-height: 1.6;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e0e0e8 !important;
  cursor: pointer;
}

.link-row {
  display: grid;
  grid-template-columns: 1fr 1.4fr 0.8fr auto;
  gap: 10px;
  margin-bottom: 10px;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
}

.admin-table th {
  padding: 12px 14px;
  text-align: left;
  color: #a0a0b0;
  font-size: 12px;
  border-bottom: 1px solid #2a2a45;
}

.admin-table td {
  padding: 12px 14px;
  color: #e0e0e8;
  border-bottom: 1px solid #1e1e35;
  font-size: 13px;
}

.faq-question-cell {
  min-width: 260px;
}

.empty-cell {
  text-align: center;
  color: #a0a0b0;
  padding: 36px;
}

.status-badge {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(148, 163, 184, 0.16);
  color: #cbd5e1;
}

.status-badge.active {
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
}

.btn-sm {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-edit {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-card {
  width: 560px;
  max-width: calc(100vw - 40px);
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 12px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #2a2a45;
}

.modal-header h3 {
  margin: 0;
  color: #fff;
  font-size: 16px;
}

.modal-close {
  border: none;
  background: transparent;
  color: #a0a0b0;
  font-size: 22px;
  cursor: pointer;
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #2a2a45;
}
</style>
