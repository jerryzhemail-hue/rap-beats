<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { fetchLicenseInfo, agreeLicense } from '@/api/beats'

// 解析原始文本协议为 HTML，区分各段落类型
const formattedContent = computed(() => {
  const raw = content.value.trim()
  if (!raw) return ''

  return raw.split('\n').map((line) => {
    const trimmed = line.trim()

    // 顶层标题（如 【使用须知 & 平台协议】）
    if (/^【.+】$/.test(trimmed)) {
      return `<div class="lic-top-title">${escapeHtml(trimmed)}</div>`
    }

    // 一级大类（✅ 允许 / ❌ 严禁 / ⚠️ 违规风险 / 🏢 平台声明 / 🔒 商用建议）
    if (/^(✅|❌|⚠️|🏢|🔒)\s/.test(trimmed)) {
      const emoji = trimmed.match(/^(.)/)?.[0] ?? ''
      const text = trimmed.replace(/^(.)/, '').trim()
      let cls = 'lic-section-title'
      if (emoji === '✅') cls += ' lic-allow'
      else if (emoji === '❌') cls += ' lic-forbid'
      else if (emoji === '⚠️') cls += ' lic-warning'
      else if (emoji === '🏢') cls += ' lic-platform'
      else if (emoji === '🔒') cls += ' lic-commercial'
      return `<div class="${cls}"><span class="lic-emoji">${emoji}</span> ${escapeHtml(text)}</div>`
    }

    // 二级小标题（1. 2. 或 —— 开头的行，或中文括号编号）
    if (/^\d+\.\s/.test(trimmed)) {
      return `<div class="lic-item-title">${escapeHtml(trimmed)}</div>`
    }
    if (/^[（(][一二三四五六七八九十百\d]+[）)]/.test(trimmed)) {
      return `<div class="lic-item-title">${escapeHtml(trimmed)}</div>`
    }
    if (trimmed.startsWith('——')) {
      return `<div class="lic-item-title lic-item-title--sub">${escapeHtml(trimmed)}</div>`
    }

    // 三级条款标题（第X章 / 第X条 / 第X款）
    if (/^第[一二三四五六七八九十百\d]+[章节条款节]/.test(trimmed)) {
      return `<div class="lic-chapter-title">${escapeHtml(trimmed)}</div>`
    }

    // 空行
    if (!trimmed) {
      return '<div class="lic-spacer"></div>'
    }

    // 普通正文（处理 < > 的转义）
    return `<div class="lic-text">${escapeHtml(trimmed)}</div>`
  }).join('')
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const props = defineProps<{
  beatId: number
  beatTitle?: string
}>()

const emit = defineEmits<{
  agreed: []
  cancelled: []
}>()

const loading = ref(true)
const submitting = ref(false)
const content = ref('')
const version = ref('1.0')
const agreed = ref(false)
const error = ref('')
const modalRef = ref<HTMLElement>()

onMounted(async () => {
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', handleKeydown)
  modalRef.value?.focus()
  try {
    const info = await fetchLicenseInfo(props.beatId)
    content.value = info.content
    version.value = info.version
    agreed.value = info.agreed
  } catch {
    error.value = '加载协议失败，请重试'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('cancelled')
  }
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('cancelled')
  }
}

async function handleConfirm() {
  if (!agreed.value) return
  submitting.value = true
  try {
    await agreeLicense(props.beatId)
    emit('agreed')
  } catch {
    error.value = '提交失败，请重试'
    submitting.value = false
  }
}

function handleCancel() {
  emit('cancelled')
}
</script>

<template>
  <Teleport to="body">
    <div class="license-overlay" @click="handleBackdropClick">
      <div class="license-modal" ref="modalRef" role="dialog" aria-modal="true" tabindex="-1">
        <!-- Header -->
        <div class="license-header">
          <div class="license-header-left">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span class="license-title">使用协议</span>
            <span v-if="version" class="license-version">v{{ version }}</span>
          </div>
          <button class="license-close" @click="handleCancel" aria-label="关闭">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Beat title hint -->
        <div v-if="beatTitle" class="license-beat-hint">
          请阅读并同意以下协议后再下载：<strong>{{ beatTitle }}</strong>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="license-loading">
          <div class="spinner"></div>
          <span>加载协议中...</span>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="license-error">
          {{ error }}
        </div>

        <!-- Content -->
        <div v-else class="license-body">
          <div ref="contentRef" class="license-content" v-html="formattedContent"></div>
        </div>

        <!-- Footer -->
        <div class="license-footer">
          <div v-if="error" class="license-error-msg">{{ error }}</div>
          <div class="license-checkbox-row">
            <label class="license-checkbox-label">
              <input
                v-model="agreed"
                type="checkbox"
                class="license-checkbox"
                :disabled="loading"
              />
              <span>我已阅读并同意以上使用协议，承诺仅将beat用于<strong>个人非商业用途</strong></span>
            </label>
          </div>
          <div class="license-actions">
            <button class="license-btn license-btn-cancel" @click="handleCancel" :disabled="submitting">
              不同意
            </button>
            <button
              class="license-btn license-btn-confirm"
              @click="handleConfirm"
              :disabled="!agreed || loading || submitting"
            >
              <span v-if="submitting">提交中...</span>
              <span v-else>同意并下载</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.license-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
  padding: 16px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.license-modal {
  background: var(--bg-card, #252540);
  border-radius: 16px;
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
  animation: slideUp 0.3s ease;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.license-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.license-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent, #7c3aed);
}

.license-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.license-version {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
}

.license-close {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
}

.license-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.license-beat-hint {
  padding: 10px 20px;
  background: rgba(124, 58, 237, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.license-beat-hint strong {
  color: rgba(255, 255, 255, 0.85);
}

.license-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-top-color: var(--accent, #7c3aed);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.license-error {
  padding: 24px;
  text-align: center;
  color: #ef4444;
  font-size: 14px;
}

.license-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.license-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

/* ── 协议正文排版 ── */
.lic-top-title {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  text-align: center;
  padding: 12px 0 20px;
  letter-spacing: 1px;
  border-bottom: 2px solid rgba(124, 58, 237, 0.4);
  margin-bottom: 20px;
}

.lic-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  padding: 10px 14px;
  border-radius: 8px;
  margin: 16px 0 10px;
  letter-spacing: 0.3px;
}

.lic-emoji {
  font-size: 16px;
  flex-shrink: 0;
}

.lic-allow {
  background: rgba(34, 197, 94, 0.1);
  color: #4ade80;
  border-left: 3px solid #22c55e;
  margin: 20px 0 12px;
}

.lic-forbid {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  border-left: 3px solid #ef4444;
  margin: 20px 0 12px;
}

.lic-warning {
  background: rgba(245, 158, 11, 0.1);
  color: #fbbf24;
  border-left: 3px solid #f59e0b;
  margin: 20px 0 12px;
}

.lic-platform {
  background: rgba(124, 58, 237, 0.1);
  color: #c084fc;
  border-left: 3px solid #9333ea;
  margin: 20px 0 12px;
}

.lic-commercial {
  background: rgba(59, 130, 246, 0.1);
  color: #60a5fa;
  border-left: 3px solid #3b82f6;
  margin: 20px 0 12px;
}

.lic-item-title {
  font-size: 13.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.88);
  padding: 8px 14px 4px;
  margin-top: 14px;
  line-height: 1.5;
}

.lic-chapter-title {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  padding: 10px 14px 6px;
  margin-top: 18px;
  letter-spacing: 0.3px;
  border-left: 3px solid rgba(124, 58, 237, 0.6);
}

.lic-item-title--sub {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

.lic-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  padding: 4px 14px 12px;
  line-height: 1.8;
}

.lic-spacer {
  height: 14px;
}

.license-footer {
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.2);
}

.license-error-msg {
  font-size: 13px;
  color: #ef4444;
  text-align: center;
}

.license-checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.license-checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
  user-select: none;
}

.license-checkbox-label strong {
  color: rgba(255, 255, 255, 0.9);
}

.license-checkbox {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  accent-color: var(--accent, #7c3aed);
  cursor: pointer;
  flex-shrink: 0;
}

.license-actions {
  display: flex;
  gap: 10px;
}

.license-btn {
  flex: 1;
  padding: 11px 16px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.license-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.license-btn-cancel {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
}

.license-btn-cancel:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.license-btn-confirm {
  background: var(--accent, #7c3aed);
  color: #fff;
}

.license-btn-confirm:hover:not(:disabled) {
  background: var(--accent-hover, #9333ea);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.4);
}
</style>
