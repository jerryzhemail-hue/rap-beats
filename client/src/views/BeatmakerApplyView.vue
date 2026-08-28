<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBeatmakerStore } from '@/stores/beatmaker'
import { uploadBeatmakerAudio } from '@/api/beatmaker'
import BeatmakerBadge from '@/components/BeatmakerBadge.vue'

const auth = useAuthStore()
const beatmakerStore = useBeatmakerStore()
const router = useRouter()

const form = reactive({
  real_name: '',
  id_card_no: '',
  portfolio_url: '',
  sample_work_url: '',
  bio: '',
  sample_audio_url: '',
})

const submitting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

// Audio upload state
const audioFile = ref<File | null>(null)
const audioPreviewUrl = ref('')
const audioUploading = ref(false)
const audioUploadProgress = ref(0)
const audioError = ref('')
const isDragging = ref(false)

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

function onAudioDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function onAudioDragLeave() {
  isDragging.value = false
}

function onAudioDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files?.length) {
    handleAudioFile(e.dataTransfer.files[0])
  }
}

function onAudioPick(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.length) {
    handleAudioFile(target.files[0])
  }
}

function handleAudioFile(file: File) {
  audioError.value = ''
  const allowed = ['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg']
  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    : ''
  if (!allowed.includes(ext)) {
    audioError.value = '仅支持 MP3、WAV、AAC、M4A、FLAC、OGG 格式'
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    audioError.value = '文件大小不能超过 20MB'
    return
  }
  audioFile.value = file
  audioPreviewUrl.value = URL.createObjectURL(file)
  audioUploadProgress.value = 0
  uploadAudio(file)
}

async function uploadAudio(file: File) {
  audioUploading.value = true
  audioError.value = ''
  audioUploadProgress.value = 0
  try {
    const result = await uploadBeatmakerAudio(file, (percent: number) => {
      audioUploadProgress.value = percent
    })
    form.sample_audio_url = result.audio_url
    audioUploadProgress.value = 100
  } catch (err: any) {
    audioError.value = err.message || '音频上传失败，请重试'
    audioFile.value = null
    audioPreviewUrl.value = ''
  } finally {
    audioUploading.value = false
  }
}

function removeAudio() {
  if (audioPreviewUrl.value) {
    URL.revokeObjectURL(audioPreviewUrl.value)
  }
  audioFile.value = null
  audioPreviewUrl.value = ''
  form.sample_audio_url = ''
  audioError.value = ''
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

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

  if (audioUploading.value) {
    errorMsg.value = '音频文件仍在上传中，请稍候…'
    return
  }

  submitting.value = true
  try {
    await beatmakerStore.apply({
      real_name: form.real_name.trim(),
      id_card_no: form.id_card_no.trim(),
      portfolio_url: form.portfolio_url.trim(),
      sample_work_url: form.sample_work_url.trim(),
      bio: form.bio.trim(),
      sample_audio_url: form.sample_audio_url || undefined,
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
    <!-- Background decoration -->
    <div class="bg-decor">
      <div class="bg-orb orb-1" />
      <div class="bg-orb orb-2" />
    </div>

    <div class="apply-container">
      <!-- Left sidebar: benefits & requirements -->
      <aside class="apply-sidebar">
        <div class="sidebar-section">
          <div class="sidebar-icon">🎵</div>
          <h2>Beatmaker 认证</h2>
          <p class="sidebar-tagline">展示你的制作实力，解锁原创伴奏上传特权</p>
        </div>

        <div class="sidebar-section">
          <h3>认证权益</h3>
          <ul class="benefit-list">
            <li>
              <span class="benefit-icon">🎹</span>
              <div>
                <strong>上传原创伴奏</strong>
                <small>发布你的 Beat 作品，赚取收益</small>
              </div>
            </li>
            <li>
              <span class="benefit-icon">💎</span>
              <div>
                <strong>创作者专属标识</strong>
                <small>个人主页认证徽章</small>
              </div>
            </li>
            <li>
              <span class="benefit-icon">📈</span>
              <div>
                <strong>流量扶持</strong>
                <small>官方推荐位曝光</small>
              </div>
            </li>
            <li>
              <span class="benefit-icon">🤝</span>
              <div>
                <strong>合作对接</strong>
                <small>与 Rapper 直接协作</small>
              </div>
            </li>
          </ul>
        </div>

        <div class="sidebar-section">
          <h3>审核标准</h3>
          <ul class="requirement-list">
            <li>需提供至少 1 首原创音频样本</li>
            <li>作品集链接（SoundCloud / 网易云等）</li>
            <li>身份证实名认证</li>
            <li>审核周期 1–3 个工作日</li>
          </ul>
        </div>

        <div class="sidebar-tip">
          <span class="tip-icon">💡</span>
          <p>Tip: 上传高质量的音频样本和完善的资料会显著加快审核进度</p>
        </div>
      </aside>

      <!-- Right main: form or status -->
      <main class="apply-main">
        <!-- 已认证 -->
        <div v-if="isApproved" class="status-card approved">
          <div class="status-header">
            <BeatmakerBadge size="lg" variant="solid" />
            <h1>你已是认证 Beatmaker</h1>
            <p class="status-desc">可前往个人主页完善资料，并开始上传原创伴奏</p>
          </div>
          <div class="status-actions">
            <button class="btn btn-primary" @click="router.push('/upload')">
              <span>🎵</span> 上传伴奏
            </button>
            <button class="btn btn-ghost" @click="router.push(`/beatmaker/profile/${auth.user?.id}`)">
              查看主页
            </button>
          </div>
        </div>

        <!-- 审核中 -->
        <div v-else-if="isPending" class="status-card pending">
          <div class="status-header">
            <div class="status-spinner" />
            <h1>申请审核中</h1>
            <p class="status-desc">已提交于 {{ new Date(existingApp!.created_at).toLocaleString('zh-CN') }}</p>
            <p class="status-muted">审核通常在 1–3 个工作日内完成，请耐心等待</p>
          </div>

          <div class="review-info">
            <div class="info-item">
              <span class="info-label">真实姓名</span>
              <span class="info-value">{{ existingApp!.real_name }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">身份证号</span>
              <span class="info-value mono">{{ existingApp!.id_card_masked }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">作品集</span>
              <a class="info-link" :href="existingApp!.portfolio_url!" target="_blank" rel="noopener">{{ existingApp!.portfolio_url }}</a>
            </div>
            <div class="info-item">
              <span class="info-label">代表作</span>
              <a class="info-link" :href="existingApp!.sample_work_url!" target="_blank" rel="noopener">{{ existingApp!.sample_work_url }}</a>
            </div>
            <div v-if="existingApp!.sample_audio_url" class="info-item">
              <span class="info-label">音频样本</span>
              <audio class="info-audio" :src="existingApp!.sample_audio_url" controls />
            </div>
            <div class="info-item full">
              <span class="info-label">个人简介</span>
              <span class="info-value">{{ existingApp!.bio }}</span>
            </div>
          </div>
        </div>

        <!-- 已驳回 -->
        <div v-else-if="isRejected && !canResubmit" class="status-card rejected">
          <div class="status-header">
            <div class="status-icon rejected-icon">✕</div>
            <h1>申请未通过</h1>
          </div>
          <div v-if="existingApp?.reject_reason" class="reject-reason">
            <span class="reject-label">驳回原因</span>
            <p>{{ existingApp.reject_reason }}</p>
          </div>
          <p class="status-muted">距可重新申请还有冷却期</p>
          <div class="info-item">
            <span class="info-label">可申请时间</span>
            <span class="info-value">{{ existingApp!.cooldown_end ? new Date(existingApp!.cooldown_end).toLocaleString('zh-CN') : '-' }}</span>
          </div>
        </div>

        <!-- 申请表单 -->
        <form v-else class="apply-form" @submit.prevent="handleSubmit">
          <div class="form-header">
            <h1>填写认证申请</h1>
            <p class="form-subtitle">所有信息将用于审核，认证通过后可在个人主页查看</p>
          </div>

          <div v-if="errorMsg" class="alert alert-error">
            <span class="alert-icon">⚠️</span>
            <span>{{ errorMsg }}</span>
          </div>
          <div v-if="successMsg" class="alert alert-success">
            <span class="alert-icon">✅</span>
            <span>{{ successMsg }}</span>
          </div>

          <!-- 音频上传 -->
          <div class="form-section">
            <label class="section-label">
              音频样本 <span class="required">*</span>
              <span class="section-hint">上传一首你最具代表性的原创作品</span>
            </label>

            <div
              v-if="!audioFile"
              class="upload-zone"
              :class="{ dragging: isDragging }"
              @dragover="onAudioDragOver"
              @dragleave="onAudioDragLeave"
              @drop="onAudioDrop"
              @click="$refs.audioInput?.click()"
            >
              <div class="upload-icon">🎵</div>
              <p class="upload-title">拖拽音频文件到此处，或 <span class="upload-link">点击选择</span></p>
              <p class="upload-hint">支持 MP3 / WAV / AAC / M4A / FLAC / OGG，最大 20MB</p>
              <input
                ref="audioInput"
                type="file"
                accept=".mp3,.wav,.aac,.m4a,.flac,.ogg,audio/*"
                class="sr-only"
                @change="onAudioPick"
              />
            </div>

            <div v-else class="audio-preview">
              <div class="audio-info">
                <div class="audio-icon">🎵</div>
                <div class="audio-meta">
                  <span class="audio-name">{{ audioFile.name }}</span>
                  <span class="audio-size">{{ formatFileSize(audioFile.size) }}</span>
                </div>
                <button type="button" class="audio-remove" @click="removeAudio" :disabled="audioUploading">
                  ✕
                </button>
              </div>
              <audio
                v-if="audioPreviewUrl && !audioUploading"
                class="audio-player"
                :src="audioPreviewUrl"
                controls
              />
              <div v-if="audioUploading" class="audio-uploading">
                <div class="upload-progress">
                  <div class="upload-progress-bar" :style="{ width: audioUploadProgress + '%' }" />
                </div>
                <span>正在上传… {{ audioUploadProgress }}%</span>
              </div>
              <div v-if="audioError" class="audio-error">{{ audioError }}</div>
            </div>
          </div>

          <!-- 基本信息 -->
          <div class="form-section">
            <label class="section-label">
              基本信息
              <span class="section-hint">用于身份核验，仅管理员可见</span>
            </label>

            <div class="form-grid">
              <div class="form-field">
                <label>真实姓名 <span class="required">*</span></label>
                <input
                  v-model="form.real_name"
                  type="text"
                  maxlength="20"
                  placeholder="请填写身份证上的真实姓名"
                  :disabled="submitting"
                />
              </div>

              <div class="form-field">
                <label>身份证号 <span class="required">*</span></label>
                <input
                  v-model="form.id_card_no"
                  type="text"
                  maxlength="18"
                  placeholder="15 位或 18 位身份证号"
                  :disabled="submitting"
                />
                <small class="field-hint">系统加密存储，仅展示前 4 位 + 后 4 位</small>
              </div>
            </div>
          </div>

          <!-- 作品集 -->
          <div class="form-section">
            <label class="section-label">
              作品集链接 <span class="required">*</span>
              <span class="section-hint">展示你的历史作品</span>
            </label>

            <div class="form-grid">
              <div class="form-field">
                <label>个人主页 <span class="required">*</span></label>
                <input
                  v-model="form.portfolio_url"
                  type="url"
                  placeholder="https://soundcloud.com/yourname"
                  :disabled="submitting"
                />
                <small class="field-hint">SoundCloud、网易云、Bilibili 等</small>
              </div>

              <div class="form-field">
                <label>代表作链接 <span class="required">*</span></label>
                <input
                  v-model="form.sample_work_url"
                  type="url"
                  placeholder="https://soundcloud.com/yourname/track"
                  :disabled="submitting"
                />
                <small class="field-hint">最能代表你风格的一首作品</small>
              </div>
            </div>
          </div>

          <!-- 个人简介 -->
          <div class="form-section">
            <label class="section-label">
              个人简介 <span class="required">*</span>
              <span class="section-hint">介绍你的制作经历、擅长风格等</span>
            </label>

            <div class="form-field full">
              <textarea
                v-model="form.bio"
                rows="5"
                maxlength="500"
                placeholder="介绍你的制作经历、擅长风格、合作过哪些 Rapper 等（≥ 20 字）"
                :disabled="submitting"
              />
              <small class="field-hint char-count">{{ form.bio.length }} / 500</small>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-submit" :disabled="submitting">
              <span v-if="submitting" class="btn-loading" />
              {{ submitting ? '提交中…' : (isRejected ? '重新提交申请' : '提交认证申请') }}
            </button>
          </div>
        </form>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ── Page Layout ────────────────────────────────────────────────────── */
.apply-page {
  min-height: 100%;
  padding: 32px 24px;
  position: relative;
  overflow-x: hidden;
}

.bg-decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
}

.orb-1 {
  width: 400px;
  height: 400px;
  background: var(--accent);
  top: -100px;
  right: -100px;
}

.orb-2 {
  width: 300px;
  height: 300px;
  background: var(--accent-hover);
  bottom: -80px;
  left: -80px;
}

.apply-container {
  position: relative;
  z-index: 1;
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 32px;
  align-items: start;
}

/* ── Sidebar ────────────────────────────────────────────────────── */
.apply-sidebar {
  position: sticky;
  top: 100px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sidebar-section:first-child {
  gap: 8px;
}

.sidebar-icon {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 4px;
}

.sidebar-section h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.sidebar-tagline {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.sidebar-section h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.benefit-list,
.requirement-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.benefit-list li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  background: var(--accent-light);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.benefit-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.benefit-list strong {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.benefit-list small {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.requirement-list {
  gap: 8px;
}

.requirement-list li {
  position: relative;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.requirement-list li::before {
  content: '✓';
  position: absolute;
  left: 0;
  top: 0;
  color: var(--accent);
  font-weight: 700;
}

.sidebar-tip {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 12px;
  font-size: 12px;
  color: var(--warning);
  line-height: 1.5;
}

.sidebar-tip p {
  margin: 0;
}

.tip-icon {
  font-size: 16px;
  flex-shrink: 0;
}

/* ── Main Area ────────────────────────────────────────────────────── */
.apply-main {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 36px;
  min-height: 600px;
}

/* ── Status Cards ────────────────────────────────────────────────────── */
.status-card {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.status-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.status-header h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
}

.status-desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
}

.status-muted {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  opacity: 0.8;
}

.status-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 4px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.rejected-icon {
  background: rgba(239, 68, 68, 0.15);
  color: var(--error);
}

.status-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* Review info */
.review-info {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.info-item {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  font-size: 14px;
}

.info-item.full {
  flex-direction: column;
  gap: 4px;
}

.info-label {
  width: 90px;
  flex-shrink: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.info-value {
  color: var(--text-primary);
  word-break: break-all;
}

.info-value.mono {
  font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
}

.info-link {
  color: var(--accent);
  text-decoration: none;
  word-break: break-all;
}

.info-link:hover {
  text-decoration: underline;
}

.info-audio {
  width: 100%;
  margin-top: 4px;
}

.reject-reason {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reject-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--error);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.reject-reason p {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
}

/* ── Form ────────────────────────────────────────────────────── */
.form-header {
  margin-bottom: 28px;
}

.form-header h1 {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
}

.form-subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.apply-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-hint {
  font-weight: 400;
  font-size: 12px;
  color: var(--text-secondary);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field.full {
  grid-column: 1 / -1;
}

.form-field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.required {
  color: var(--error);
}

.form-field input,
.form-field textarea {
  width: 100%;
  padding: 11px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-primary);
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.form-field input::placeholder,
.form-field textarea::placeholder {
  color: rgba(160, 160, 176, 0.5);
}

.form-field input:focus,
.form-field textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.form-field input:disabled,
.form-field textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-field textarea {
  resize: vertical;
  min-height: 120px;
}

.field-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.field-hint.char-count {
  text-align: right;
}

/* ── Audio Upload ────────────────────────────────────────────── */
.upload-zone {
  border: 2px dashed var(--border);
  border-radius: 16px;
  padding: 36px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-secondary);
}

.upload-zone:hover,
.upload-zone.dragging {
  border-color: var(--accent);
  background: var(--accent-light);
}

.upload-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.upload-title {
  margin: 0 0 4px;
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;
}

.upload-link {
  color: var(--accent);
  font-weight: 600;
}

.upload-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.audio-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.audio-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.audio-icon {
  font-size: 28px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-light);
  border-radius: 12px;
  flex-shrink: 0;
}

.audio-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.audio-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-size {
  font-size: 12px;
  color: var(--text-secondary);
}

.audio-remove {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: var(--error);
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.audio-remove:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
}

.audio-uploading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.upload-progress {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.upload-progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.2s ease;
}

.audio-player {
  width: 100%;
  height: 40px;
}

.audio-error {
  font-size: 13px;
  color: var(--error);
}

/* ── Alerts ────────────────────────────────────────────────────── */
.alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  font-size: 14px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.alert-error {
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.alert-success {
  background: rgba(16, 185, 129, 0.12);
  color: var(--success);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.alert-icon {
  font-size: 16px;
  flex-shrink: 0;
}

/* ── Actions ────────────────────────────────────────────────────── */
.form-actions {
  margin-top: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 28px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.btn-primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: #fff;
  box-shadow: 0 4px 14px var(--shadow);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px var(--shadow);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-ghost {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-ghost:hover {
  background: var(--bg-secondary);
}

.btn-submit {
  width: 100%;
  padding: 14px 28px;
  font-size: 15px;
}

.btn-loading {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* ── Responsive ────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .apply-container {
    grid-template-columns: 1fr;
  }

  .apply-sidebar {
    position: static;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .apply-page {
    padding: 16px 12px;
  }

  .apply-main {
    padding: 24px 20px;
    border-radius: 16px;
  }

  .apply-sidebar {
    padding: 20px 18px;
    border-radius: 16px;
  }

  .status-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}
</style>
