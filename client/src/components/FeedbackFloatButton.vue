<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { submitFeedback } from '@/api/feedback'
import AuthPromptModal from './AuthPromptModal.vue'

const authStore = useAuthStore()
const showForm = ref(false)
const showAuthPrompt = ref(false)
const form = ref({ type: 'bug', title: '', content: '', contact: '' })
const loading = ref(false)
const error = ref('')
const success = ref('')

function open() {
  if (!authStore.isAuthenticated) {
    showAuthPrompt.value = true
    return
  }
  showForm.value = true
  error.value = ''
  success.value = ''
}

function close() {
  showForm.value = false
  error.value = ''
  success.value = ''
}

async function submit() {
  error.value = ''
  success.value = ''
  if (!form.value.title.trim()) { error.value = '请填写标题'; return }
  if (form.value.content.trim().length < 10) { error.value = '详细描述至少10字'; return }
  loading.value = true
  try {
    await submitFeedback({
      type: form.value.type,
      title: form.value.title.trim(),
      content: form.value.content.trim(),
      contact: form.value.contact.trim() || undefined,
    })
    success.value = '反馈已提交，感谢你的意见！'
    setTimeout(close, 1500)
    form.value = { type: 'bug', title: '', content: '', contact: '' }
  } catch (e: any) {
    error.value = e?.error || '提交失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="feedback-float">
    <!-- 悬浮按钮 -->
    <button class="float-btn" @click="open" title="意见反馈">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>

    <!-- 表单弹窗 -->
    <Teleport to="body">
      <div v-if="showForm" class="modal-overlay" @click.self="close">
        <div class="modal-card">
          <div class="modal-header">
            <h3>意见反馈</h3>
            <button class="modal-close" @click="close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>反馈类型</label>
              <select v-model="form.type" class="form-select">
                <option value="bug">Bug 问题</option>
                <option value="suggestion">功能建议</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div class="form-group">
              <label>标题 <span class="required">*</span></label>
              <input v-model="form.title" type="text" class="form-input" placeholder="简要描述问题或建议" maxlength="50" />
            </div>
            <div class="form-group">
              <label>详细描述 <span class="required">*</span></label>
              <textarea v-model="form.content" class="form-textarea" placeholder="请详细描述遇到的问题或建议（至少10字）" rows="5" maxlength="1000"></textarea>
              <div class="char-count">{{ form.content.length }} / 1000</div>
            </div>
            <div class="form-group">
              <label>联系方式（选填）</label>
              <input v-model="form.contact" type="text" class="form-input" placeholder="微信或邮箱，方便我们联系你" maxlength="100" />
            </div>
            <div v-if="error" class="msg error">{{ error }}</div>
            <div v-if="success" class="msg success">{{ success }}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" @click="close">取消</button>
            <button class="btn btn-primary" :disabled="loading" @click="submit">
              <span v-if="loading" class="spinner"></span>
              <span v-else>提交反馈</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <AuthPromptModal
      v-if="showAuthPrompt"
      message="登录后可提交反馈，是否前往登录？"
      confirm-text="去登录"
      cancel-text="取消"
      @confirm="$router.push('/login?requireAuth=1&redirect=/beats')"
      @cancel="showAuthPrompt = false"
    />
  </div>
</template>

<style scoped>
.feedback-float {
  position: fixed;
  right: 20px;
  bottom: 80px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.float-btn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed, #5b21b6);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(124, 58, 237, 0.5);
  transition: transform 0.2s, box-shadow 0.2s;
}
.float-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 28px rgba(124, 58, 237, 0.65);
}
.float-btn:active {
  transform: scale(0.96);
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s;
}

.modal-card {
  background: #1a1a2e;
  border: 1px solid #2a2a45;
  border-radius: 16px;
  width: 420px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.25s ease;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #2a2a45;
}
.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #e0e0e8;
  margin: 0;
}
.modal-close {
  background: none;
  border: none;
  color: #6b6b80;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}
.modal-close:hover { color: #e0e0e8; }

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 12px 24px 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 13px;
  color: #a0a0b0;
  font-weight: 500;
}
.required { color: #f87171; }

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 9px 12px;
  background: #1e1e3a;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  font-family: inherit;
}
.form-input:focus,
.form-select:focus,
.form-textarea:focus { border-color: #7c3aed; }
.form-textarea { resize: vertical; }

.char-count {
  text-align: right;
  font-size: 12px;
  color: #6b6b80;
  margin-top: 2px;
}

.msg {
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 6px;
}
.msg.error { color: #f87171; background: rgba(239,68,68,0.1); }
.msg.success { color: #4ade80; background: rgba(74,222,128,0.1); }

/* 通用按钮 */
.btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary { background: #7c3aed; color: white; }
.btn-primary:hover:not(:disabled) { background: #6d28d9; }
.btn-outline { background: transparent; border: 1px solid #2a2a45; color: #e0e0e8; }
.btn-outline:hover { border-color: #7c3aed; }
.spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: middle;
}

@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
@keyframes spin { to { transform: rotate(360deg) } }
</style>
