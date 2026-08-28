<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  fetchAdminNotifications,
  fetchAdminUnreadCount,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  deleteAdminNotification,
  clearAdminNotifications,
  type AdminNotification
} from '@/api/admin-notifications';

const notifications = ref<AdminNotification[]>([]);
const unreadCount = ref(0);
const loading = ref(false);
const filterType = ref<string>('all');

const typeMeta: Record<string, { label: string; icon: string; color: string }> = {
  new_user_registered: { label: '新用户注册', icon: '👤', color: '#3b82f6' },
  beatmaker_application: { label: 'Beatmaker 申请', icon: '🎭', color: '#8b5cf6' },
  beatmaker_approved: { label: '认证通过', icon: '✅', color: '#10b981' },
  beatmaker_rejected: { label: '认证驳回', icon: '❌', color: '#ef4444' },
  vip_purchased: { label: '会员购买', icon: '👑', color: '#f59e0b' },
  system_event: { label: '系统事件', icon: '⚙️', color: '#6b7280' }
};

const filteredNotifications = computed(() => {
  if (filterType.value === 'all') return notifications.value;
  return notifications.value.filter(n => n.type === filterType.value);
});

async function loadData() {
  loading.value = true;
  try {
    const [listRes, unreadRes] = await Promise.all([
      fetchAdminNotifications(),
      fetchAdminUnreadCount()
    ]);
    notifications.value = listRes.notifications;
    unreadCount.value = unreadRes.unreadCount;
  } catch (err) {
    console.error('加载管理员通知失败:', err);
  } finally {
    loading.value = false;
  }
}

async function handleMarkRead(id: number) {
  try {
    await markAdminNotificationRead(id);
    const n = notifications.value.find(n => n.id === id);
    if (n) n.is_read = 1;
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  } catch (err) {
    console.error('标记已读失败:', err);
  }
}

async function handleMarkAllRead() {
  try {
    await markAllAdminNotificationsRead();
    notifications.value.forEach(n => (n.is_read = 1));
    unreadCount.value = 0;
  } catch (err) {
    console.error('全部已读失败:', err);
  }
}

async function handleDelete(id: number) {
  try {
    await deleteAdminNotification(id);
    notifications.value = notifications.value.filter(n => n.id !== id);
  } catch (err) {
    console.error('删除失败:', err);
  }
}

async function handleClearAll() {
  if (!confirm('确定清空所有通知吗？')) return;
  try {
    await clearAdminNotifications();
    notifications.value = [];
    unreadCount.value = 0;
  } catch (err) {
    console.error('清空失败:', err);
  }
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return d.toLocaleString('zh-CN');
}

function getMeta(type: string) {
  return typeMeta[type] || typeMeta.system_event;
}

const typeFilters = [
  { key: 'all', label: '全部' },
  ...Object.entries(typeMeta).map(([k, v]) => ({ key: k, label: v.label }))
];

onMounted(loadData);
</script>

<template>
  <div class="admin-notifications">
    <!-- 头部操作栏 -->
    <div class="header-bar">
      <div class="header-info">
        <span class="unread-badge" v-if="unreadCount > 0">{{ unreadCount }}</span>
        <span class="total-count">共 {{ notifications.length }} 条通知</span>
      </div>
      <div class="header-actions">
        <button
          class="btn btn-mark-all"
          :disabled="unreadCount === 0"
          @click="handleMarkAllRead"
        >
          全部已读
        </button>
        <button
          class="btn btn-clear"
          :disabled="notifications.length === 0"
          @click="handleClearAll"
        >
          清空通知
        </button>
      </div>
    </div>

    <!-- 类型筛选 -->
    <div class="filter-bar">
      <button
        v-for="f in typeFilters"
        :key="f.key"
        class="filter-btn"
        :class="{ active: filterType === f.key }"
        @click="filterType = f.key"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- 通知列表 -->
    <div class="notification-list" v-if="filteredNotifications.length > 0">
      <div
        v-for="n in filteredNotifications"
        :key="n.id"
        class="notification-item"
        :class="{ unread: !n.is_read }"
      >
        <div class="notif-icon" :style="{ background: getMeta(n.type).color + '20', color: getMeta(n.type).color }">
          {{ getMeta(n.type).icon }}
        </div>
        <div class="notif-body" @click="handleMarkRead(n.id)">
          <div class="notif-header">
            <span class="notif-type">{{ getMeta(n.type).label }}</span>
            <span class="notif-time">{{ formatTime(n.created_at) }}</span>
            <span class="unread-dot" v-if="!n.is_read"></span>
          </div>
          <div class="notif-title">{{ n.title }}</div>
          <div class="notif-content" v-if="n.content">{{ n.content }}</div>
        </div>
        <div class="notif-actions">
          <button
            v-if="!n.is_read"
            class="action-btn"
            @click="handleMarkRead(n.id)"
          >
            标为已读
          </button>
          <button class="action-btn delete" @click="handleDelete(n.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="empty-state" v-else-if="!loading">
      <div class="empty-icon">📭</div>
      <div class="empty-text">暂无通知</div>
      <div class="empty-hint">当有新用户注册、Beatmaker 申请或会员购买时，将在这里显示</div>
    </div>

    <!-- 加载状态 -->
    <div class="loading" v-if="loading">加载中...</div>
  </div>
</template>

<style scoped>
.admin-notifications {
  max-width: 960px;
}

.header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1a2e;
  border: 1px solid #2a2a4a;
  border-radius: 12px;
  margin-bottom: 16px;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 700;
}

.total-count {
  color: #8888a8;
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-mark-all {
  background: rgba(124, 58, 237, 0.15);
  color: #a78bfa;
  border: 1px solid rgba(124, 58, 237, 0.3);
}

.btn-mark-all:hover:not(:disabled) {
  background: rgba(124, 58, 237, 0.25);
}

.btn-clear {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.btn-clear:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
}

.filter-bar {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 6px 14px;
  background: #1a1a2e;
  border: 1px solid #2a2a4a;
  border-radius: 20px;
  color: #8888a8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: #2a2a4a;
  color: #ccc;
}

.filter-btn.active {
  background: rgba(124, 58, 237, 0.2);
  border-color: #7c3aed;
  color: #a78bfa;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notification-item {
  display: flex;
  gap: 14px;
  padding: 16px;
  background: #1a1a2e;
  border: 1px solid #2a2a4a;
  border-radius: 12px;
  transition: all 0.2s;
}

.notification-item.unread {
  border-left: 3px solid #7c3aed;
  background: rgba(124, 58, 237, 0.06);
}

.notification-item:hover {
  background: #22223a;
}

.notif-icon {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 20px;
  flex-shrink: 0;
}

.notif-body {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.notif-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.notif-type {
  font-size: 12px;
  font-weight: 600;
  color: #8888a8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.notif-time {
  font-size: 12px;
  color: #666680;
}

.unread-dot {
  width: 8px;
  height: 8px;
  background: #7c3aed;
  border-radius: 50%;
}

.notif-title {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0f0;
  margin-bottom: 4px;
}

.notif-content {
  font-size: 13px;
  color: #9999b0;
  line-height: 1.5;
}

.notif-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.action-btn {
  padding: 6px 10px;
  background: transparent;
  border: 1px solid #2a2a4a;
  border-radius: 6px;
  color: #8888a8;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.action-btn:hover {
  background: #2a2a4a;
  color: #ccc;
}

.action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 16px;
  color: #8888a8;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 13px;
  color: #666680;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #8888a8;
}
</style>
