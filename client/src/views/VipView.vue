<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchVipStatus } from '@/api/user'
import { createOrder, fetchOrders } from '@/api/payment'
import { isPaidVipLevel, vipLevelNames, vipPlanConfig } from '@/constants/vip'
import type { Order, VipStatus } from '@/types'

const authStore = useAuthStore()
const vipStatus = ref<VipStatus | null>(null)
const orders = ref<Order[]>([])
const purchasing = ref<string | null>(null)
const purchaseSuccess = ref('')
const purchaseError = ref('')

// 支付方式选择弹窗
const showPayMethod = ref(false)
const selectedLevel = ref('')
const selectedPlanName = ref('')

onMounted(async () => {
  if (authStore.isAuthenticated) {
    try {
      vipStatus.value = await fetchVipStatus()
    } catch {
      // ignore
    }

    try {
      const data = await fetchOrders()
      orders.value = Array.isArray(data) ? data : []
    } catch {
      orders.value = []
    }
  }
})

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const levelOrder: Record<string, number> = {
  free: 0,
  basic: 1,
  premium: 2,
  ultimate: 3
}

function isCurrentOrHigher(level: string): boolean {
  const currentLevel = authStore.vipLevel || 'free'
  return levelOrder[currentLevel] >= levelOrder[level]
}

const currentVipOrder = computed(() => {
  if (!isPaidVipLevel(authStore.vipLevel)) return null
  return orders.value.find((order) => order.status === 'completed' && order.vip_level === authStore.vipLevel) || null
})

const currentVipAmount = computed(() => {
  if (!isPaidVipLevel(authStore.vipLevel)) return null
  return currentVipOrder.value?.amount ?? vipPlanConfig[authStore.vipLevel].price
})

const currentVipBenefits = computed(() => {
  if (!isPaidVipLevel(authStore.vipLevel)) return []
  return vipPlanConfig[authStore.vipLevel].benefits
})

function formatMoney(amount?: number | null): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '-'
  return `¥${Number(amount).toFixed(2)}`
}

function openPayMethod(level: string) {
  if (!authStore.isAuthenticated) {
    purchaseError.value = '请先登录后再开通会员'
    return
  }

  selectedLevel.value = level
  selectedPlanName.value = vipLevelNames[level as keyof typeof vipLevelNames]
  showPayMethod.value = true
  purchaseSuccess.value = ''
  purchaseError.value = ''
}

async function handlePay(payType: 'wechat' | 'alipay') {
  const level = selectedLevel.value
  showPayMethod.value = false
  purchasing.value = level
  purchaseSuccess.value = ''
  purchaseError.value = ''

  try {
    const data: any = await createOrder(level, payType)
    if (data.mode === 'mock') {
      // 模拟支付成功
      purchaseSuccess.value = data.message || '支付成功！会员已开通'
      await authStore.checkAuth()
      try {
        vipStatus.value = await fetchVipStatus()
      } catch {
        // ignore
      }
      try {
        const ordersData = await fetchOrders()
        orders.value = Array.isArray(ordersData) ? ordersData : []
      } catch {
        // ignore
      }
    } else if (data.url) {
      // 跳转到虎皮椒支付页面
      window.location.href = data.url
    }
  } catch (err: any) {
    purchaseError.value = err.message || '支付失败，请稍后再试'
  } finally {
    purchasing.value = null
  }
}
</script>

<template>
  <div class="vip-view">
    <div class="vip-hero">
      <div class="vip-hero-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </div>
      <h1 class="vip-hero-title">选择会员方案</h1>
      <p class="vip-hero-subtitle">解锁更多伴奏资源，畅享创作灵感</p>
    </div>

    <!-- 已是VIP状态显示 -->
    <div v-if="authStore.isVip && vipStatus" class="vip-status-card" :style="{ borderColor: authStore.vipLevel === 'basic' ? '#cd7f32' : authStore.vipLevel === 'premium' ? '#c0c0c0' : '#f59e0b' }">
      <div class="status-icon">✨</div>
      <h2 :style="{ color: authStore.vipLevel === 'basic' ? '#cd7f32' : authStore.vipLevel === 'premium' ? '#c0c0c0' : '#f59e0b' }">您已是{{ vipLevelNames[authStore.vipLevel] }}</h2>
      <div class="status-info">
        <div class="status-item">
          <span class="status-label">到期时间</span>
          <span class="status-value">{{ formatDate(vipStatus.vip_expire_at) }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">花费金额</span>
          <span class="status-value">{{ formatMoney(currentVipAmount) }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">今日下载</span>
          <span class="status-value">{{ vipStatus.daily_downloads }} / {{ vipStatus.daily_limit ?? '无限' }}</span>
        </div>
      </div>
      <div class="status-benefits">
        <span v-for="benefit in currentVipBenefits" :key="benefit" class="status-benefit">{{ benefit }}</span>
      </div>
      <button class="renew-btn" @click="openPayMethod(authStore.vipLevel)">一键续费</button>
    </div>

    <!-- 三栏方案对比 -->
    <div class="plans-container">
      <!-- 基础会员 -->
      <div class="plan-card basic">
        <div class="plan-badge" style="background: #cd7f32">基础会员</div>
        <div class="plan-price">¥19.9<span>/月</span></div>
        <ul class="plan-features">
          <li class="feature-yes">每日下载 10 次</li>
          <li class="feature-yes">完整试听</li>
          <li class="feature-no">VIP专属内容</li>
          <li class="feature-no">高品质音频</li>
        </ul>
        <button
          v-if="authStore.isAuthenticated && authStore.vipLevel === 'basic'"
          class="plan-btn btn-basic"
          :disabled="purchasing === 'basic'"
          @click="openPayMethod('basic')"
        >{{ purchasing === 'basic' ? '处理中...' : '续费当前方案' }}</button>
        <button
          v-else-if="authStore.isAuthenticated && isCurrentOrHigher('basic')"
          class="plan-btn btn-current"
          disabled
        >更高等级已开通</button>
        <button
          v-else
          class="plan-btn btn-basic"
          :disabled="purchasing === 'basic'"
          @click="openPayMethod('basic')"
        >
          <span v-if="purchasing === 'basic'" class="btn-spinner"></span>
          <span v-else>{{ authStore.isAuthenticated ? '立即开通' : '登录后开通' }}</span>
        </button>
      </div>

      <!-- 高级会员（推荐） -->
      <div class="plan-card premium recommended">
        <div class="recommend-tag">推荐</div>
        <div class="plan-badge" style="background: #c0c0c0">高级会员</div>
        <div class="plan-price">¥49.9<span>/月</span></div>
        <ul class="plan-features">
          <li class="feature-yes">每日下载 30 次</li>
          <li class="feature-yes">完整试听</li>
          <li class="feature-yes">VIP专属内容</li>
          <li class="feature-yes">高品质音频</li>
        </ul>
        <button
          v-if="authStore.isAuthenticated && authStore.vipLevel === 'premium'"
          class="plan-btn btn-premium"
          :disabled="purchasing === 'premium'"
          @click="openPayMethod('premium')"
        >{{ purchasing === 'premium' ? '处理中...' : '续费当前方案' }}</button>
        <button
          v-else-if="authStore.isAuthenticated && isCurrentOrHigher('premium')"
          class="plan-btn btn-current"
          disabled
        >更高等级已开通</button>
        <button
          v-else
          class="plan-btn btn-premium"
          :disabled="purchasing === 'premium'"
          @click="openPayMethod('premium')"
        >
          <span v-if="purchasing === 'premium'" class="btn-spinner"></span>
          <span v-else>{{ authStore.isAuthenticated ? '立即开通' : '登录后开通' }}</span>
        </button>
      </div>

      <!-- 至尊会员 -->
      <div class="plan-card ultimate">
        <div class="plan-badge" style="background: #f59e0b">至尊会员</div>
        <div class="plan-price">¥99.9<span>/月</span></div>
        <ul class="plan-features">
          <li class="feature-yes">无限下载</li>
          <li class="feature-yes">完整试听</li>
          <li class="feature-yes">VIP专属内容</li>
          <li class="feature-yes">高品质音频</li>
        </ul>
        <button
          v-if="authStore.isAuthenticated && authStore.vipLevel === 'ultimate'"
          class="plan-btn btn-ultimate"
          :disabled="purchasing === 'ultimate'"
          @click="openPayMethod('ultimate')"
        >{{ purchasing === 'ultimate' ? '处理中...' : '续费当前方案' }}</button>
        <button
          v-else-if="authStore.isAuthenticated && isCurrentOrHigher('ultimate')"
          class="plan-btn btn-current"
          disabled
        >更高等级已开通</button>
        <button
          v-else
          class="plan-btn btn-ultimate"
          :disabled="purchasing === 'ultimate'"
          @click="openPayMethod('ultimate')"
        >
          <span v-if="purchasing === 'ultimate'" class="btn-spinner"></span>
          <span v-else>{{ authStore.isAuthenticated ? '立即开通' : '登录后开通' }}</span>
        </button>
      </div>
    </div>

    <!-- 免费用户当前方案提示 -->
    <div v-if="authStore.isAuthenticated && !authStore.isVip && vipStatus" class="free-status-card">
      <p>当前为免费用户 · 今日剩余 {{ vipStatus.remaining_downloads }} 次下载 · 可完整试听全站伴奏</p>
    </div>

    <!-- 支付方式选择弹窗 -->
    <div class="pay-method-modal" v-if="showPayMethod">
      <div class="pay-method-card">
        <h3>选择支付方式</h3>
        <p class="pay-method-desc">开通 {{ selectedPlanName }}</p>
        <div class="pay-buttons">
          <button class="pay-btn wechat" @click="handlePay('wechat')">
            <span class="pay-icon">💬</span> 微信支付
          </button>
          <button class="pay-btn alipay" @click="handlePay('alipay')">
            <span class="pay-icon">🔵</span> 支付宝
          </button>
        </div>
        <button class="cancel-btn" @click="showPayMethod = false">取消</button>
      </div>
    </div>

    <!-- 支付提示 -->
    <div v-if="purchaseSuccess" class="purchase-notice success-notice">
      <p>{{ purchaseSuccess }}</p>
    </div>
    <div v-if="purchaseError" class="purchase-notice error-notice">
      <p>{{ purchaseError }}</p>
    </div>

    <!-- 开通说明 -->
    <div class="contact-notice">
      <p>选择方案后即可自助开通，无需联系管理员</p>
    </div>

    <!-- 权益表格 -->
    <div class="table-section">
      <h2 class="section-title">权益对比详情</h2>
      <table class="benefits-table">
        <thead>
          <tr>
            <th>权益</th>
            <th>免费用户</th>
            <th style="color: #cd7f32">基础会员</th>
            <th style="color: #c0c0c0">高级会员</th>
            <th style="color: #f59e0b">至尊会员</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>每日下载</td>
            <td>3次</td>
            <td>10次</td>
            <td>30次</td>
            <td class="highlight">无限</td>
          </tr>
          <tr>
            <td>试听</td>
            <td>登录后完整播放</td>
            <td class="highlight">完整播放</td>
            <td class="highlight">完整播放</td>
            <td class="highlight">完整播放</td>
          </tr>
          <tr>
            <td>VIP专属内容</td>
            <td>不可访问</td>
            <td>不可访问</td>
            <td class="highlight">可访问</td>
            <td class="highlight">可访问</td>
          </tr>
          <tr>
            <td>高品质音频</td>
            <td>不可用</td>
            <td>不可用</td>
            <td class="highlight">可用</td>
            <td class="highlight">可用</td>
          </tr>
          <tr>
            <td>月费</td>
            <td>免费</td>
            <td>¥19.9</td>
            <td>¥49.9</td>
            <td>¥99.9</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.vip-view {
  max-width: 1000px;
  margin: 0 auto;
  padding: 48px 24px 80px;
}

.vip-hero {
  text-align: center;
  margin-bottom: 48px;
}

.vip-hero-icon {
  margin-bottom: 16px;
}

.vip-hero-title {
  font-size: 40px;
  font-weight: 800;
  margin: 0 0 12px;
  background: linear-gradient(135deg, #cd7f32, #c0c0c0, #f59e0b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.vip-hero-subtitle {
  font-size: 18px;
  color: var(--text-secondary);
  margin: 0;
}

/* VIP Status Card */
.vip-status-card {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05));
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 16px;
  padding: 32px;
  text-align: center;
  margin-bottom: 48px;
}

.status-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.vip-status-card h2 {
  font-size: 24px;
  margin: 0 0 16px;
}

.status-info {
  display: flex;
  justify-content: center;
  gap: 32px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-label {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-value {
  font-size: 18px;
  font-weight: 600;
  color: #f59e0b;
}

.status-benefits {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-bottom: 20px;
}

.status-benefit {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
  font-size: 13px;
}

.renew-btn {
  border: none;
  border-radius: 999px;
  padding: 12px 22px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #1a1a2e;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.renew-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.28);
}

/* Plans Container */
.plans-container {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 20px;
  margin-bottom: 32px;
}

.plan-card {
  background: var(--bg-card);
  border-radius: 16px;
  padding: 28px 24px;
  border: 1px solid var(--border);
  text-align: center;
  position: relative;
  transition: transform 0.2s, box-shadow 0.2s;
}

.plan-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

.plan-card.recommended {
  border-color: #c0c0c0;
  box-shadow: 0 0 40px rgba(192, 192, 192, 0.1);
  transform: scale(1.04);
}

.plan-card.recommended:hover {
  transform: scale(1.04) translateY(-4px);
}

.recommend-tag {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: #c0c0c0;
  color: #000;
  font-size: 11px;
  font-weight: 800;
  padding: 4px 16px;
  border-radius: 12px;
  letter-spacing: 1px;
}

.plan-badge {
  display: inline-block;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  padding: 4px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.plan-price {
  font-size: 36px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 20px;
}

.plan-price span {
  font-size: 14px;
  font-weight: 400;
  color: var(--text-secondary);
}

.plan-features {
  list-style: none;
  padding: 0;
  margin: 0 0 20px;
  text-align: left;
}

.plan-features li {
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  color: var(--text-secondary);
}

.plan-features li:last-child {
  border-bottom: none;
}

.feature-yes::before {
  content: '✓ ';
  color: #16a34a;
  font-weight: 700;
}

.feature-no::before {
  content: '✗ ';
  color: var(--text-secondary);
  opacity: 0.5;
  font-weight: 700;
}

.feature-no {
  opacity: 0.5;
}

.current-plan-tag {
  background: rgba(124, 58, 237, 0.15);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: 8px;
  border: 1px solid rgba(124, 58, 237, 0.3);
}

/* Plan Buttons */
.plan-btn {
  display: inline-block;
  width: 100%;
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  box-sizing: border-box;
  text-align: center;
}

.plan-btn:disabled {
  cursor: not-allowed;
}

.btn-basic {
  background: linear-gradient(135deg, #cd7f32, #b8722d);
  color: #fff;
}
.btn-basic:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(205, 127, 50, 0.4);
}

.btn-premium {
  background: linear-gradient(135deg, #d4d4d4, #a0a0a0);
  color: #1a1a2e;
  padding: 14px 24px;
  font-size: 16px;
}
.btn-premium:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(192, 192, 192, 0.4);
}

.btn-ultimate {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #1a1a2e;
}
.btn-ultimate:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
}

.btn-current {
  background: rgba(124, 58, 237, 0.15);
  color: var(--accent);
  border: 1px solid rgba(124, 58, 237, 0.3);
  opacity: 0.7;
}

.btn-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Pay Method Modal */
.pay-method-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.pay-method-card {
  background: #1a1a2e;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px;
  text-align: center;
  min-width: 320px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.pay-method-card h3 {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--text-primary);
}

.pay-method-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 24px;
}

.pay-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.pay-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 24px;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.pay-btn.wechat {
  background: #07c160;
  color: #fff;
}

.pay-btn.wechat:hover {
  background: #06ad56;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(7, 193, 96, 0.4);
}

.pay-btn.alipay {
  background: #1677ff;
  color: #fff;
}

.pay-btn.alipay:hover {
  background: #0958d9;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(22, 119, 255, 0.4);
}

.pay-icon {
  font-size: 20px;
}

.cancel-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 8px 24px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

/* Purchase Notice */
.purchase-notice {
  text-align: center;
  margin-bottom: 16px;
}

.purchase-notice p {
  font-size: 14px;
  padding: 12px 20px;
  border-radius: 8px;
  margin: 0;
  display: inline-block;
}

.success-notice p {
  background: rgba(22, 163, 74, 0.1);
  color: #16a34a;
  border: 1px solid rgba(22, 163, 74, 0.2);
}

.error-notice p {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

/* Free Status Card */
.free-status-card {
  text-align: center;
  margin-bottom: 24px;
}

.free-status-card p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

/* Contact Notice */
.contact-notice {
  text-align: center;
  margin-bottom: 48px;
}

.contact-notice p {
  font-size: 14px;
  color: var(--text-secondary);
  background: rgba(245, 158, 11, 0.08);
  padding: 12px 20px;
  border-radius: 8px;
  border: 1px dashed rgba(245, 158, 11, 0.3);
  margin: 0;
  display: inline-block;
}

/* Section Title */
.section-title {
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  margin: 0 0 32px;
}

/* Table */
.table-section {
  margin-top: 16px;
}

.benefits-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.benefits-table th {
  padding: 14px 16px;
  text-align: left;
  background: rgba(255, 255, 255, 0.03);
  font-size: 13px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.benefits-table td {
  padding: 14px 16px;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
}

.benefits-table tbody tr:last-child td {
  border-bottom: none;
}

.benefits-table td.highlight {
  color: #f59e0b;
  font-weight: 600;
}

@media (max-width: 768px) {
  .plans-container {
    grid-template-columns: 1fr;
  }

  .plan-card.recommended {
    transform: none;
  }

  .plan-card.recommended:hover {
    transform: translateY(-4px);
  }

  .vip-hero-title {
    font-size: 28px;
  }

  .status-info {
    flex-direction: column;
    gap: 12px;
  }

  .benefits-table {
    font-size: 12px;
  }

  .benefits-table th,
  .benefits-table td {
    padding: 10px 8px;
  }
}
</style>
