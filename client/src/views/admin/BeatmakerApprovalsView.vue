<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  fetchAdminApplications,
  approveBeatmakerApplication,
  rejectBeatmakerApplication
} from '@/api/beatmaker'

const auth = useAuthStore()
const loading = ref(false)
const error = ref('')
const statusFilter = ref<'pending' | 'approved' | 'rejected'>('pending')
const items = ref<any[]>([])
const total = ref(0)

const rejectModalOpen = ref(false)
const rejectingId = ref<number | null>(null)
const rejectReason = ref('')

onMounted(async () => {
  if (!auth.isAdmin) return
  await load()
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchAdminApplications({ status: statusFilter.value })
    items.value = data.items
    total.value = data.total
  } catch (err: any) {
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function approve(id: number) {
  if (!confirm('确认通过该申请？')) return
  try {
    await approveBeatmakerApplication(id)
    await load()
  } catch (err: any) {
    alert(err.message || '操作失败')
  }
}

function openRejectModal(id: number) {
  rejectingId.value = id
  rejectReason.value = ''
  rejectModalOpen.value = true
}

async function submitReject() {
  if (!rejectingId.value) return
  if (!rejectReason.value.trim()) {
    alert('请填写驳回原因')
    return
  }
  try {
    await rejectBeatmakerApplication(rejectingId.value, rejectReason.value.trim())
    rejectModalOpen.value = false
    await load()
  } catch (err: any) {
    alert(err.message || '操作失败')
  }
}

const statusLabel = computed(() => {
  return { pending: '待审核', approved: '已通过', rejected: '已驳回' }[statusFilter.value]
})
</script>

<template>
  <div class="approvals-page">
    <header class="page-header">
      <h1>Beatmaker 认证审核</h1>
      <p class="muted">共 {{ total }} 条{{ statusLabel }}申请</p>
    </header>

    <div class="tabs">
      <button :class="{ active: statusFilter === 'pending' }" @click="statusFilter = 'pending'; load()">待审核</button>
      <button :class="{ active: statusFilter === 'approved' }" @click="statusFilter = 'approved'; load()">已通过</button>
      <button :class="{ active: statusFilter === 'rejected' }" @click="statusFilter = 'rejected'; load()">已驳回</button>
    </div>

    <div v-if="loading" class="state">加载中…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="items.length === 0" class="state empty">暂无{{ statusLabel }}申请</div>
    <table v-else class="apps-table">
      <thead>
        <tr>
          <th>申请人</th>
          <th>真实姓名</th>
          <th>身份证</th>
          <th>作品集</th>
          <th>代表作</th>
          <th>提交时间</th>
          <th v-if="statusFilter === 'pending'">操作</th>
          <th v-else>审核状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>
            <div class="user-cell">
              <strong>{{ item.username }}</strong>
              <small>{{ item.email }}</small>
            </div>
          </td>
          <td>{{ item.real_name }}</td>
          <td class="mono">{{ item.id_card_masked }}</td>
          <td>
            <a v-if="item.portfolio_url" :href="item.portfolio_url" target="_blank" rel="noopener" class="link">查看 ↗</a>
            <span v-else class="muted">-</span>
          </td>
          <td>
            <a v-if="item.sample_work_url" :href="item.sample_work_url" target="_blank" rel="noopener" class="link">查看 ↗</a>
            <span v-else class="muted">-</span>
          </td>
          <td class="muted">{{ new Date(item.created_at).toLocaleString('zh-CN') }}</td>
          <td v-if="statusFilter === 'pending'">
            <div class="action-btns">
              <button class="btn-approve" @click="approve(item.id)">通过</button>
              <button class="btn-reject" @click="openRejectModal(item.id)">驳回</button>
            </div>
          </td>
          <td v-else>
            <span v-if="item.status === 'approved'" class="status approved">已通过</span>
            <span v-else class="status rejected">
              已驳回
              <small v-if="item.reject_reason">{{ item.reject_reason }}</small>
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- 驳回原因弹窗 -->
    <div v-if="rejectModalOpen" class="modal-overlay" @click.self="rejectModalOpen = false">
      <div class="modal">
        <h3>驳回申请</h3>
        <p class="muted">请说明驳回原因，用户可在 3 天后重新申请</p>
        <textarea v-model="rejectReason" rows="4" placeholder="例如：作品集链接无法访问 / 代表作与本人信息不符" />
        <div class="modal-actions">
          <button class="btn-cancel" @click="rejectModalOpen = false">取消</button>
          <button class="btn-confirm-reject" @click="submitReject">确认驳回</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.approvals-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 16px;
}

.page-header { margin-bottom: 16px; }
.page-header h1 { margin: 0 0 4px; font-size: 24px; }
.muted { color: var(--text-secondary, #6b7280); font-size: 13px; }

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  padding-bottom: 8px;
}

.tabs button {
  padding: 8px 16px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary, #6b7280);
}

.tabs button.active {
  background: rgba(245, 158, 11, 0.1);
  color: #b45309;
  font-weight: 600;
}

.state {
  text-align: center;
  padding: 60px 16px;
  color: var(--text-secondary, #6b7280);
}

.state.error { color: #b91c1c; }

.apps-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--card-bg, #fff);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.apps-table th,
.apps-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  font-size: 14px;
}

.apps-table th {
  background: rgba(0, 0, 0, 0.02);
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
}

.user-cell { display: flex; flex-direction: column; }
.user-cell small { color: var(--text-secondary, #9ca3af); font-size: 12px; }

.mono { font-family: ui-monospace, Menlo, monospace; font-size: 13px; }

.link { color: #d97706; text-decoration: none; }
.link:hover { text-decoration: underline; }

.action-btns { display: flex; gap: 6px; }

.btn-approve,
.btn-reject {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}

.btn-approve { background: #10b981; color: #fff; }
.btn-approve:hover { background: #059669; }
.btn-reject { background: #fee2e2; color: #b91c1c; }
.btn-reject:hover { background: #fecaca; }

.status { font-size: 13px; font-weight: 500; }
.status.approved { color: #15803d; }
.status.rejected { color: #b91c1c; display: flex; flex-direction: column; gap: 4px; }
.status small { color: var(--text-secondary, #9ca3af); font-weight: 400; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--card-bg, #fff);
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 480px;
}

.modal h3 { margin: 0 0 8px; font-size: 18px; }
.modal textarea {
  width: 100%;
  margin-top: 12px;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
  box-sizing: border-box;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.btn-cancel,
.btn-confirm-reject {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-cancel { background: rgba(0, 0, 0, 0.05); }
.btn-confirm-reject { background: #dc2626; color: #fff; }
.btn-confirm-reject:hover { background: #b91c1c; }
</style>