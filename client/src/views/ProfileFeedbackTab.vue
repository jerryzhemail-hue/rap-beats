<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { submitFeedback, fetchMyFeedback } from '@/api/feedback'
import { formatDate } from '@/utils/format'

// feedback
const myFeedback = ref<any[]>([])
const myFeedbackTotal = ref(0)
const myFeedbackPage = ref(1)
const myFeedbackTotalPages = ref(1)
const myFeedbackLoading = ref(false)
const feedbackForm = ref({ type: 'bug', title: '', content: '', contact: '' })
const feedbackSubmitError = ref('')
const feedbackSubmitSuccess = ref('')
const feedbackLoading = ref(false)


async function loadMyFeedback() {
  myFeedbackLoading.value = true
  try {
    const data = await fetchMyFeedback(myFeedbackPage.value)
    myFeedback.value = data.feedback
    myFeedbackTotal.value = data.total
    myFeedbackTotalPages.value = data.totalPages
  } catch (e) {
    console.error(e)
  } finally {
    myFeedbackLoading.value = false
  }
}

async function handleSubmitFeedback() {
  feedbackSubmitError.value = ''
  feedbackSubmitSuccess.value = ''
  const { type, title, content, contact } = feedbackForm.value
  if (!title.trim()) { feedbackSubmitError.value = '请填写标题'; return }
  if (content.trim().length < 10) { feedbackSubmitError.value = '详细描述至少10字'; return }
  feedbackLoading.value = true
  try {
    await submitFeedback({ type, title: title.trim(), content, contact })
    feedbackSubmitSuccess.value = '反馈已提交，感谢你的意见！'
    feedbackForm.value = { type: 'bug', title: '', content: '', contact: '' }
    myFeedbackPage.value = 1
    await loadMyFeedback()
  } catch (e: any) {
    feedbackSubmitError.value = e?.error || '提交失败，请重试'
  } finally {
    feedbackLoading.value = false
  }
}

onMounted(() => { loadMyFeedback() })
</script>

<template>
    <div class="tab-content">
      <div class="feedback-section">
        <h2 class="section-title">提交意见反馈</h2>
        <form class="feedback-form" @submit.prevent="handleSubmitFeedback">
          <div class="form-group">
            <label class="form-label">反馈类型 <span class="required">*</span></label>
            <select v-model="feedbackForm.type" class="form-select">
              <option value="bug">🐛 Bug 问题</option>
              <option value="suggestion">💡 功能建议</option>
              <option value="other">📝 其他</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">标题 <span class="required">*</span></label>
            <input v-model="feedbackForm.title" type="text" class="form-input" placeholder="简要描述问题或建议（最多50字）" maxlength="50" />
          </div>
          <div class="form-group">
            <label class="form-label">详细描述 <span class="required">*</span></label>
            <textarea v-model="feedbackForm.content" class="form-textarea" placeholder="请详细描述你遇到的问题或你的建议（至少10字，最多1000字）" rows="6" maxlength="1000"></textarea>
            <div class="char-count">{{ feedbackForm.content.length }} / 1000</div>
          </div>
          <div class="form-group">
            <label class="form-label">联系方式（选填）</label>
            <input v-model="feedbackForm.contact" type="text" class="form-input" placeholder="微信 / 邮箱，方便我们联系你（选填）" maxlength="100" />
          </div>
          <div v-if="feedbackSubmitError" class="error-message">{{ feedbackSubmitError }}</div>
          <div v-if="feedbackSubmitSuccess" class="success-message">{{ feedbackSubmitSuccess }}</div>
          <button type="submit" class="btn btn-primary" :disabled="feedbackLoading">
            <span v-if="feedbackLoading" class="spinner"></span>
            <span v-else>提交反馈</span>
          </button>
        </form>

        <div class="my-feedback-list">
          <h3 class="section-title" style="margin-top: 40px;">我的反馈记录</h3>
          <div v-if="myFeedbackLoading" class="loading-state">加载中...</div>
          <div v-else-if="myFeedback.length === 0" class="empty-state">暂无反馈记录</div>
          <div v-else class="feedback-items">
            <div v-for="item in myFeedback" :key="item.id" class="feedback-card">
              <div class="feedback-card-header">
                <span class="feedback-type-badge" :class="item.type">{{ item.type === 'bug' ? 'Bug问题' : item.type === 'suggestion' ? '功能建议' : '其他' }}</span>
                <span class="feedback-status-badge" :class="item.status">{{ item.status === 'pending' ? '待处理' : item.status === 'replied' ? '已回复' : '已关闭' }}</span>
              </div>
              <div class="feedback-card-title">{{ item.title }}</div>
              <div class="feedback-card-content">{{ item.content }}</div>
              <div v-if="item.reply" class="feedback-reply">
                <div class="feedback-reply-label">管理员回复：</div>
                <div class="feedback-reply-content">{{ item.reply }}</div>
              </div>
              <div class="feedback-card-time">{{ formatDate(item.created_at) }}</div>
            </div>
          </div>
          <div v-if="myFeedbackTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="myFeedbackPage === 1" @click="myFeedbackPage--; loadMyFeedback()">上一页</button>
            <span class="page-info">{{ myFeedbackPage }} / {{ myFeedbackTotalPages }}</span>
            <button class="page-btn" :disabled="myFeedbackPage === myFeedbackTotalPages" @click="myFeedbackPage++; loadMyFeedback()">下一页</button>
          </div>
        </div>
      </div>
    </div>

</template>
