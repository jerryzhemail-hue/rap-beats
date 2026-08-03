<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchAdminStats } from '@/api/admin'

interface Stats {
  totalUsers: number
  totalBeats: number
  totalDownloads: number
  totalComments: number
}

interface RecentUser {
  id: number
  username: string
  email: string
  role: string
  created_at: string
}

interface RecentBeat {
  id: number
  title: string
  producer: string
  genre: string
  bpm: number
  created_at: string
}

const stats = ref<Stats>({ totalUsers: 0, totalBeats: 0, totalDownloads: 0, totalComments: 0 })
const recentUsers = ref<RecentUser[]>([])
const recentBeats = ref<RecentBeat[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const data = await fetchAdminStats() as any
    stats.value = data.stats
    recentUsers.value = data.recentUsers
    recentBeats.value = data.recentBeats
  } catch (err) {
    console.error('Failed to load stats:', err)
  } finally {
    loading.value = false
  }
})

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr + 'Z').toLocaleDateString('zh-CN')
}

const statCards = [
  { key: 'totalUsers' as const, label: '总用户数', icon: '👥', color: '#7c3aed' },
  { key: 'totalBeats' as const, label: '总伴奏数', icon: '🎵', color: '#3b82f6' },
  { key: 'totalDownloads' as const, label: '总下载量', icon: '📥', color: '#10b981' },
  { key: 'totalComments' as const, label: '总评论数', icon: '💬', color: '#f59e0b' }
]
</script>

<template>
  <div class="dashboard">
    <div v-if="loading" class="loading">加载中...</div>
    <template v-else>
      <div class="stat-cards">
        <div
          v-for="card in statCards"
          :key="card.key"
          class="stat-card"
        >
          <div class="stat-icon" :style="{ background: card.color + '20', color: card.color }">
            {{ card.icon }}
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats[card.key] }}</div>
            <div class="stat-label">{{ card.label }}</div>
          </div>
        </div>
      </div>

      <div class="recent-section">
        <div class="recent-block">
          <h3>最近注册用户</h3>
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>注册时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in recentUsers" :key="user.id">
                <td>{{ user.id }}</td>
                <td>{{ user.username }}</td>
                <td>{{ user.email }}</td>
                <td>
                  <span class="badge" :class="user.role === 'admin' ? 'badge-admin' : 'badge-user'">
                    {{ user.role }}
                  </span>
                </td>
                <td>{{ formatDate(user.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="recent-block">
          <h3>最近上传伴奏</h3>
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>标题</th>
                <th>制作人</th>
                <th>风格</th>
                <th>BPM</th>
                <th>上传时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="beat in recentBeats" :key="beat.id">
                <td>{{ beat.id }}</td>
                <td>{{ beat.title }}</td>
                <td>{{ beat.producer }}</td>
                <td>{{ beat.genre }}</td>
                <td>{{ beat.bpm }}</td>
                <td>{{ formatDate(beat.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 1200px;
}

.loading {
  text-align: center;
  color: #a0a0b0;
  padding: 60px 0;
  font-size: 16px;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 32px;
}

.stat-card {
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #a0a0b0;
  margin-top: 2px;
}

.recent-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.recent-block {
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 12px;
  padding: 20px;
}

.recent-block h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.admin-table th {
  text-align: left;
  padding: 10px 12px;
  color: #a0a0b0;
  font-weight: 500;
  border-bottom: 1px solid #2a2a45;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.admin-table td {
  padding: 10px 12px;
  color: #e0e0e8;
  border-bottom: 1px solid #1e1e35;
}

.admin-table tbody tr:hover {
  background: rgba(124, 58, 237, 0.05);
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

@media (max-width: 900px) {
  .stat-cards {
    grid-template-columns: repeat(2, 1fr);
  }
  .recent-section {
    grid-template-columns: 1fr;
  }
}
</style>
