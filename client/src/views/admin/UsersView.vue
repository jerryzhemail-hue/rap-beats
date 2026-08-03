<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchAdminUsers, updateUserRole, deleteUser, setUserVip, clearTestUsers } from '@/api/admin'
import type { VipLevel } from '@/types'

interface UserItem {
  id: number
  username: string
  email: string
  role: string
  vip_level: string
  vip_expire_at: string | null
  created_at: string
}

const authStore = useAuthStore()
const users = ref<UserItem[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const search = ref('')
const loading = ref(true)

// Confirm dialog state
const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmAction = ref<(() => Promise<void>) | null>(null)

// VIP dialog state
const vipDialogVisible = ref(false)
const vipTargetUser = ref<UserItem | null>(null)
const vipLevelSelect = ref<VipLevel>('basic')
const vipDays = ref(30)

const vipLevelOptions: { value: VipLevel; label: string; color: string }[] = [
  { value: 'free', label: '免费', color: '#a0a0b0' },
  { value: 'basic', label: '基础会员', color: '#cd7f32' },
  { value: 'premium', label: '高级会员', color: '#c0c0c0' },
  { value: 'ultimate', label: '至尊会员', color: '#f59e0b' },
]

async function loadUsers() {
  loading.value = true
  try {
    const data = await fetchAdminUsers({ page: page.value, search: search.value }) as any
    users.value = data.users
    total.value = data.total
    totalPages.value = data.totalPages
  } catch (err) {
    console.error('Failed to load users:', err)
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)

watch(page, loadUsers)

let searchTimer: ReturnType<typeof setTimeout>
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    loadUsers()
  }, 300)
})

function showConfirm(title: string, message: string, action: () => Promise<void>) {
  confirmTitle.value = title
  confirmMessage.value = message
  confirmAction.value = action
  confirmVisible.value = true
}

function closeConfirm() {
  confirmVisible.value = false
  confirmAction.value = null
}

async function executeConfirm() {
  if (confirmAction.value) {
    await confirmAction.value()
  }
  closeConfirm()
}

function handleToggleRole(user: UserItem) {
  if (user.id === authStore.user?.id) return
  const newRole = user.role === 'admin' ? 'user' : 'admin'
  const label = newRole === 'admin' ? '管理员' : '普通用户'
  showConfirm(
    '修改用户角色',
    `确定将用户「${user.username}」的角色修改为「${label}」吗？`,
    async () => {
      try {
        await updateUserRole(user.id, newRole)
        await loadUsers()
      } catch (err: any) {
        alert(err.message || '操作失败')
      }
    }
  )
}

function handleDeleteUser(user: UserItem) {
  if (user.id === authStore.user?.id) return
  showConfirm(
    '删除用户',
    `确定删除用户「${user.username}」吗？此操作不可撤销，该用户的所有评论和收藏也将被删除。`,
    async () => {
      try {
        await deleteUser(user.id)
        await loadUsers()
      } catch (err: any) {
        alert(err.message || '操作失败')
      }
    }
  )
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr + 'Z').toLocaleDateString('zh-CN')
}

function isSelf(user: UserItem) {
  return user.id === authStore.user?.id
}

function openVipDialog(user: UserItem) {
  vipTargetUser.value = user
  vipLevelSelect.value = (user.vip_level as VipLevel) || 'basic'
  vipDays.value = 30
  vipDialogVisible.value = true
}

function closeVipDialog() {
  vipDialogVisible.value = false
  vipTargetUser.value = null
}

async function handleSetVip() {
  if (!vipTargetUser.value) return
  try {
    await setUserVip(vipTargetUser.value.id, vipLevelSelect.value, vipDays.value)
    closeVipDialog()
    await loadUsers()
  } catch (err: any) {
    alert(err.message || '操作失败')
  }
}

function getVipLevelInfo(level: string) {
  return vipLevelOptions.find(o => o.value === level) || vipLevelOptions[0]
}

function formatVipExpire(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function handleClearTestUsers() {
  showConfirm(
    '清空测试账号',
    '确定删除除 admin 之外的所有账号吗？该操作会同步清理这些用户的收藏、评论、下载、订单，并把他们上传内容的归属置空。',
    async () => {
      try {
        await clearTestUsers()
        page.value = 1
        await loadUsers()
      } catch (err: any) {
        alert(err.message || '清理失败')
      }
    }
  )
}
</script>

<template>
  <div class="users-view">
    <div class="toolbar">
      <input
        v-model="search"
        type="text"
        class="search-input"
        placeholder="搜索用户名或邮箱..."
      />
      <button class="btn-sm btn-danger toolbar-btn" @click="handleClearTestUsers">一键清空测试账号</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <template v-else>
      <div class="table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户名</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>VIP</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" :class="{ 'is-self': isSelf(user) }">
              <td>{{ user.id }}</td>
              <td>{{ user.username }}</td>
              <td>{{ user.email }}</td>
              <td>
                <span class="badge" :class="user.role === 'admin' ? 'badge-admin' : 'badge-user'">
                  {{ user.role }}
                </span>
              </td>
              <td>
                <span class="badge" :style="{ background: getVipLevelInfo(user.vip_level).color + '33', color: getVipLevelInfo(user.vip_level).color }">
                  {{ getVipLevelInfo(user.vip_level).label }}
                </span>
                <span v-if="user.vip_level !== 'free' && user.vip_expire_at" class="vip-expire">到期: {{ formatVipExpire(user.vip_expire_at) }}</span>
              </td>
              <td>{{ formatDate(user.created_at) }}</td>
              <td class="actions">
                <button
                  class="btn-sm btn-role"
                  :disabled="isSelf(user)"
                  :title="isSelf(user) ? '不能修改自己的角色' : '切换角色'"
                  @click="handleToggleRole(user)"
                >
                  {{ user.role === 'admin' ? '设为用户' : '设为管理员' }}
                </button>
                <button
                  class="btn-sm btn-vip-action"
                  @click="openVipDialog(user)"
                >
                  {{ user.vip_level !== 'free' ? '管理VIP' : '设置VIP' }}
                </button>
                <button
                  class="btn-sm btn-danger"
                  :disabled="isSelf(user)"
                  :title="isSelf(user) ? '不能删除自己' : '删除用户'"
                  @click="handleDeleteUser(user)"
                >
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button class="page-btn" :disabled="page <= 1" @click="page--">上一页</button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="page-btn" :disabled="page >= totalPages" @click="page++">下一页</button>
      </div>
    </template>

    <!-- Confirm Dialog -->
    <Teleport to="body">
      <div v-if="confirmVisible" class="modal-overlay" @click.self="closeConfirm">
        <div class="modal-card">
          <h3>{{ confirmTitle }}</h3>
          <p>{{ confirmMessage }}</p>
          <div class="modal-actions">
            <button class="btn-sm btn-cancel" @click="closeConfirm">取消</button>
            <button class="btn-sm btn-confirm" @click="executeConfirm">确认</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- VIP Dialog -->
    <Teleport to="body">
      <div v-if="vipDialogVisible" class="modal-overlay" @click.self="closeVipDialog">
        <div class="modal-card">
          <h3>设置会员等级 - {{ vipTargetUser?.username }}</h3>
          <div v-if="vipTargetUser && vipTargetUser.vip_level !== 'free'" class="vip-current-status">
            当前状态: <span class="badge" :style="{ background: getVipLevelInfo(vipTargetUser.vip_level).color + '33', color: getVipLevelInfo(vipTargetUser.vip_level).color }">{{ getVipLevelInfo(vipTargetUser.vip_level).label }}</span>
            <span v-if="vipTargetUser?.vip_expire_at" class="vip-expire">到期: {{ formatVipExpire(vipTargetUser.vip_expire_at) }}</span>
          </div>
          <div class="vip-form">
            <label class="vip-label">会员等级</label>
            <select v-model="vipLevelSelect" class="vip-level-select">
              <option v-for="opt in vipLevelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div v-if="vipLevelSelect !== 'free'" class="vip-form">
            <label class="vip-label">开通天数</label>
            <input v-model.number="vipDays" type="number" min="1" class="vip-days-input" />
          </div>
          <div class="modal-actions">
            <button class="btn-sm btn-cancel" @click="closeVipDialog">取消</button>
            <button class="btn-sm btn-vip-confirm" @click="handleSetVip">
              {{ vipLevelSelect === 'free' ? '设为免费' : `设为${getVipLevelInfo(vipLevelSelect).label} ${vipDays}天` }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.users-view {
  max-width: 1200px;
}

.loading {
  text-align: center;
  color: #a0a0b0;
  padding: 60px 0;
  font-size: 16px;
}

.toolbar {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  width: 320px;
  padding: 10px 16px;
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input::placeholder {
  color: #666;
}

.search-input:focus {
  border-color: #7c3aed;
}

.toolbar-btn {
  padding: 10px 16px;
}

.table-wrapper {
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 12px;
  overflow: hidden;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.admin-table th {
  text-align: left;
  padding: 12px 16px;
  color: #a0a0b0;
  font-weight: 500;
  border-bottom: 1px solid #2a2a45;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #16162a;
}

.admin-table td {
  padding: 12px 16px;
  color: #e0e0e8;
  border-bottom: 1px solid #1e1e35;
}

.admin-table tbody tr:hover {
  background: rgba(124, 58, 237, 0.05);
}

.admin-table tbody tr.is-self {
  opacity: 0.7;
}

.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-admin {
  background: rgba(124, 58, 237, 0.2);
  color: #a78bfa;
}

.badge-user {
  background: rgba(100, 100, 120, 0.2);
  color: #a0a0b0;
}

.badge-vip {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.badge-novip {
  background: rgba(100, 100, 120, 0.2);
  color: #a0a0b0;
}

.vip-expire {
  font-size: 11px;
  color: #a0a0b0;
  margin-left: 4px;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-sm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-role {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.btn-role:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.25);
}

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
}

.page-btn {
  padding: 8px 16px;
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: #7c3aed;
  color: #7c3aed;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 14px;
  color: #a0a0b0;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: #1e1e38;
  border: 1px solid #2a2a45;
  border-radius: 16px;
  padding: 28px;
  min-width: 400px;
  max-width: 500px;
}

.modal-card h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  color: #fff;
}

.modal-card p {
  margin: 0 0 24px 0;
  font-size: 14px;
  color: #a0a0b0;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  background: #2a2a45;
  color: #a0a0b0;
}

.btn-cancel:hover {
  background: #35355a;
}

.btn-confirm {
  background: #7c3aed;
  color: #fff;
}

.btn-confirm:hover {
  background: #9333ea;
}

.btn-vip-action {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.btn-vip-action:hover {
  background: rgba(245, 158, 11, 0.25);
}

.btn-vip-confirm {
  background: #f59e0b;
  color: #000;
}

.btn-vip-confirm:hover {
  background: #d97706;
}

.vip-current-status {
  margin-bottom: 16px;
  font-size: 14px;
  color: #a0a0b0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.vip-form {
  margin-bottom: 24px;
}

.vip-label {
  display: block;
  font-size: 13px;
  color: #a0a0b0;
  margin-bottom: 8px;
}

.vip-days-input {
  width: 100%;
  padding: 10px 14px;
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.vip-days-input:focus {
  border-color: #f59e0b;
}

.vip-level-select {
  width: 100%;
  padding: 10px 14px;
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
  cursor: pointer;
}

.vip-level-select:focus {
  border-color: #f59e0b;
}

.vip-level-select option {
  background: #1a1a30;
  color: #fff;
}
</style>
