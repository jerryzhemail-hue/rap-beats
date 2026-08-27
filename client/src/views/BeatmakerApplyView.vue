<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBeatmakerStore } from '@/stores/beatmaker'
import BeatmakerBadge from '@/components/BeatmakerBadge.vue'

const auth = useAuthStore()
const beatmakerStore = useBeatmakerStore()
const router = useRouter()

const form = reactive({
  real_name: '',
  id_card_no: '',
  portfolio_url: '',
  sample_work_url: '',
  bio: ''
})

const submitting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const existingApp = computed(() => beatmakerStore.myApplication)
const isApproved = computed(() => auth.isBeatmaker)
const isPending = computed(() => existingApp.value?.status === 'pending')
const isRejected = computed(() => existingApp.value?.status === 'rejected')
const canResubmit = computed(() => {
  if (!isRejected.value || !existingApp.value?.cooldown_end) return true
  return new Date(existingApp.value.cooldown_end).getTime() <= Date.now()
})

onMounted(async () => {
  if (!auth.isAuthenticated) {
    router.push('/login')
    return
  }
  await beatmakerStore.loadMyApplication(true)
})

function validate(): string | null {
  const name = form.real_name.trim()
  if (name.length < 2) return '请填写真实姓名（至少 2 个字符）'

  const idCard = form.id_card_no.trim()
  const idRe = /^\d{15}(\d{2}[0-9Xx])?$/
  if (!idRe.test(idCard)) return '请填写有效的身份证号（15 位或 18 位）'

  if (!/^https?:\/\//.test(form.portfolio_url.trim())) return '请填写作品集链接（http(s):// 开头）'
  if (!/^https?:\/\//.test(form.sample_work_url.trim())) return '请填写代表作链接（http(s):// 开头）'

  if (form.bio.trim().length < 20) return '请填写个人简介（至少 20 个字符）'
  return null
}

async function handleSubmit() {
  errorMsg.value = ''
  successMsg.value = ''

  if (!canResubmit.value && isRejected.value) {
    errorMsg.value = `被驳回后 ${3} 天内不可重复申请，请耐心等待`
    return
  }

  const validationError = validate()
  if (validationError) {
    errorMsg.value = validationError
    return
  }

  submitting.value = true
  try {
    await beatmakerStore.apply({
      real_name: form.real_name.trim(),
      id_card_no: form.id_card_no.trim(),
      portfolio_url: form.portfolio_url.trim(),
      sample_work_url: form.sample_work_url.trim(),
      bio: form.bio.trim()
    })
    successMsg.value = '申请已提交，请等待管理员审核'
  } catch (err: any) {
    errorMsg.value = err.message || '提交失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="apply-page">
    <div class="apply-card">
      <header class="apply-header">
        <h1>Beatmaker 原创制作人认证</h1>
        <p class="subtitle">通过认证后即可上传原创伴奏，享受创作者专属权益</p>
      </header>

      <!-- 已认证 -->
      <div v-if="isApproved" class="status-card approved">
        <div class="status-icon">
          <BeatmakerBadge size="lg" variant="solid" />
        </div>
        <h2>你已是认证 Beatmaker</h2>
        <p>可前往个人主页完善资料，并开始上传原创伴奏</p>
        <div class="actions">
          <button class="btn primary" @click="router.push('/upload')">去上传</button>
          <button class="btn secondary" @click="router.push(`/beatmaker/profile/${auth.user?.id}`)">查看主页</button>
        </div>
      </div>

      <!-- 审核中 -->
      <div v-else-if="isPending" class="status-card pending">
        <div class="status-icon">
          <div class="spinner" />
        </div>
        <h2>申请审核中</h2>
        <p>已提交于 {{ new Date(existingApp!.created_at).toLocaleString('zh-CN') }}</p>
        <p class="muted">审核通常在 1–3 个工作日内完成，请耐心等待</p>
        <div class="review-info">
          <div class="info-row">
            <span class="label">真实姓名</span>
            <span>{{ existingApp!.real_name }}</span>
          </div>
          <div class="info-row">
            <span class="label">身份证号</span>
            <span class="mono">{{ existingApp!.id_card_masked }}</span>
          </div>
          <div class="info-row">
            <span class="label">作品集</span>
            <a :href="existingApp!.portfolio_url!" target="_blank" rel="noopener">{{ existingApp!.portfolio_url }}</a>
          </div>
          <div class="info-row">
            <span class="label">代表作</span>
            <a :href="existingApp!.sample_work_url!" target="_blank" rel="noopener">{{ existingApp!.sample_work_url }}</a>
          </div>
          <div class="info-row">
            <span class="label">个人简介</span>
            <span>{{ existingApp!.bio }}</span>
          </div>
        </div>
      </div>

      <!-- 已驳回 -->
      <div v-else-if="isRejected && !canResubmit" class="status-card rejected">
        <h2>申请未通过</h2>
        <p class="reject-reason" v-if="existingApp?.reject_reason">
          驳回原因：{{ existingApp.reject_reason }}
        </p>
        <p class="muted">距可重新申请还有冷却期</p>
        <div class="info-row">
          <span class="label">可申请时间</span>
          <span>{{ existingApp!.cooldown_end ? new Date(existingApp!.cooldown_end).toLocaleString('zh-CN') : '-' }}</span>
        </div>
      </div>

      <!-- 申请表 -->
      <form v-else class="apply-form" @submit.prevent="handleSubmit">
        <div v-if="errorMsg" class="alert error">{{ errorMsg }}</div>
        <div v-if="successMsg" class="alert success">{{ successMsg }}</div>

        <div class="field">
          <label>真实姓名 <span class="required">*</span></label>
          <input
            v-model="form.real_name"
            type="text"
            maxlength="20"
            placeholder="请填写身份证上的真实姓名"
            :disabled="submitting"
          />
          <small>用于身份核验，仅管理员可见</small>
        </div>

        <div class="field">
          <label>身份证号 <span class="required">*</span></label>
          <input
            v-model="form.id_card_no"
            type="text"
            maxlength="18"
            placeholder="15 位或 18 位身份证号"
            :disabled="submitting"
          />
          <small>系统加密存储，仅展示前 4 位 + 后 4 位</small>
        </div>

        <div class="field">
          <label>作品集链接 <span class="required">*</span></label>
          <input
            v-model="form.portfolio_url"
            type="url"
            placeholder="https://soundcloud.com/yourname"
            :disabled="submitting"
          />
          <small>SoundCloud、网易云、Bilibili 等个人主页</small>
        </div>

        <div class="field">
          <label>代表作链接 <span class="required">*</span></label>
          <input
            v-model="form.sample_work_url"
            type="url"
            placeholder="https://soundcloud.com/yourname/track"
            :disabled="submitting"
          />
          <small>最能代表你风格的一首作品</small>
        </div>

        <div class="field">
          <label>个人简介 <span class="required">*</span></label>
          <textarea
            v-model="form.bio"
            rows="5"
            maxlength="500"
            placeholder="介绍你的制作经历、擅长风格、合作过哪些 Rapper 等（≥ 20 字）"
            :disabled="submitting"
          />
          <small>{{ form.bio.length }} / 500</small>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn primary" :disabled="submitting">
            {{ submitting ? '提交中…' : (isRejected ? '重新申请' : '提交申请') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.apply-page {
  min-height: calc(100vh - 200px);
  padding: 32px 16px;
  display: flex;
  justify-content: center;
}

.apply-card {
  width: 100%;
  max-width: 640px;
  background: var(--card-bg, #fff);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.apply-header h1 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
}

.subtitle {
  margin: 0 0 24px;
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
}

.status-card {
  text-align: center;
  padding: 32px 16px;
}

.status-icon {
  margin-bottom: 16px;
  display: flex;
  justify-content: center;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e5e7eb;
  border-top-color: #f59e0b;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-card h2 { margin: 0 0 12px; font-size: 20px; }
.status-card p { margin: 0 0 8px; color: var(--text-secondary, #6b7280); }
.status-card .muted { color: #9ca3af; font-size: 13px; }

.reject-reason {
  background: #fef2f2;
  color: #b91c1c;
  padding: 12px;
  border-radius: 8px;
  margin: 16px 0;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
}

.review-info {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
  padding: 16px;
  margin-top: 24px;
  text-align: left;
}

.info-row {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  font-size: 14px;
}

.info-row:last-child { border-bottom: none; }

.info-row .label {
  width: 90px;
  color: var(--text-secondary, #6b7280);
  flex-shrink: 0;
}

.info-row .mono { font-family: ui-monospace, Menlo, monospace; }

.apply-form .field {
  margin-bottom: 20px;
}

.apply-form label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 14px;
}

.required { color: #ef4444; }

.apply-form input,
.apply-form textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.apply-form input:focus,
.apply-form textarea:focus {
  outline: none;
  border-color: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
}

.apply-form input:disabled,
.apply-form textarea:disabled { background: #f9fafb; opacity: 0.7; }

.apply-form textarea { resize: vertical; }

.apply-form small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
}

.alert {
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.alert.error { background: #fef2f2; color: #b91c1c; }
.alert.success { background: #f0fdf4; color: #15803d; }

.form-actions { margin-top: 24px; }

.btn {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.btn.primary {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  width: 100%;
}

.btn.primary:hover:not(:disabled) { transform: translateY(-1px); }
.btn.primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn.secondary {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-primary, #111827);
}
</style>