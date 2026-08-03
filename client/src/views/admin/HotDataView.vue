<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { fetchAdminHotData } from '@/api/admin'

type HotBeat = {
  id: number
  title: string
  producer: string
  genre: string
  bpm: number
  download_count: number
  recent_downloads: number
  favorite_count: number
  recent_favorites: number
  play_count: number
  recent_plays: number
  hot_score: number
  created_at: string
}

type HotOverview = {
  recentDownloads: number
  recentFavorites: number
  recentPlays: number
}

const days = ref(7)
const limit = ref(10)
const loading = ref(true)
const overview = ref<HotOverview>({
  recentDownloads: 0,
  recentFavorites: 0,
  recentPlays: 0
})
const beats = ref<HotBeat[]>([])

async function loadHotData() {
  loading.value = true
  try {
    const data = await fetchAdminHotData({ days: days.value, limit: limit.value }) as {
      overview: HotOverview
      beats: HotBeat[]
    }
    overview.value = data.overview
    beats.value = data.beats
  } catch (error) {
    console.error('Failed to load hot data:', error)
    overview.value = { recentDownloads: 0, recentFavorites: 0, recentPlays: 0 }
    beats.value = []
  } finally {
    loading.value = false
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr + 'Z').toLocaleDateString('zh-CN')
}

onMounted(loadHotData)
watch([days, limit], loadHotData)
</script>

<template>
  <div class="hot-data-view">
    <div class="toolbar">
      <div class="toolbar-group">
        <label>统计周期</label>
        <select v-model="days">
          <option :value="7">近 7 天</option>
          <option :value="14">近 14 天</option>
          <option :value="30">近 30 天</option>
        </select>
      </div>
      <div class="toolbar-group">
        <label>榜单数量</label>
        <select v-model="limit">
          <option :value="10">TOP 10</option>
          <option :value="20">TOP 20</option>
          <option :value="30">TOP 30</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <template v-else>
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-label">周期下载</div>
          <div class="stat-value">{{ overview.recentDownloads }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">周期收藏</div>
          <div class="stat-value">{{ overview.recentFavorites }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">周期播放</div>
          <div class="stat-value">{{ overview.recentPlays }}</div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-header">
          <h3>综合热度榜</h3>
          <p>权重：近7天下载 * 5 + 总下载 * 1 + 近7天收藏 * 3 + 总收藏 * 1 + 近7天播放 * 1 + 总播放 * 0.2</p>
        </div>
        <table class="admin-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>标题</th>
              <th>制作人</th>
              <th>风格</th>
              <th>近7天下载</th>
              <th>总下载</th>
              <th>近7天收藏</th>
              <th>总收藏</th>
              <th>近7天播放</th>
              <th>总播放</th>
              <th>热度分</th>
              <th>上传时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(beat, index) in beats" :key="beat.id">
              <td>
                <span class="rank-badge">TOP {{ index + 1 }}</span>
              </td>
              <td>{{ beat.title }}</td>
              <td>{{ beat.producer }}</td>
              <td>{{ beat.genre }}</td>
              <td>{{ beat.recent_downloads }}</td>
              <td>{{ beat.download_count }}</td>
              <td>{{ beat.recent_favorites }}</td>
              <td>{{ beat.favorite_count }}</td>
              <td>{{ beat.recent_plays }}</td>
              <td>{{ beat.play_count }}</td>
              <td>{{ Number(beat.hot_score).toFixed(1) }}</td>
              <td>{{ formatDate(beat.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hot-data-view {
  max-width: 1280px;
}

.toolbar {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toolbar-group label {
  color: #a0a0b0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.toolbar-group select {
  min-width: 140px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #2a2a45;
  background: #1a1a30;
  color: #fff;
}

.loading {
  text-align: center;
  color: #a0a0b0;
  padding: 60px 0;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}

.stat-card,
.table-card {
  background: #1a1a30;
  border: 1px solid #2a2a45;
  border-radius: 12px;
}

.stat-card {
  padding: 20px;
}

.stat-label {
  color: #a0a0b0;
  font-size: 13px;
}

.stat-value {
  margin-top: 8px;
  color: #fff;
  font-size: 32px;
  font-weight: 700;
}

.table-card {
  padding: 20px;
}

.table-header h3 {
  margin: 0;
  color: #fff;
  font-size: 18px;
}

.table-header p {
  margin: 8px 0 16px;
  color: #a0a0b0;
  font-size: 13px;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.admin-table th,
.admin-table td {
  padding: 12px 10px;
  border-bottom: 1px solid #252540;
  text-align: left;
  color: #e0e0e8;
}

.admin-table th {
  color: #a0a0b0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.admin-table tbody tr:hover {
  background: rgba(124, 58, 237, 0.06);
}

.rank-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: #fff;
  font-weight: 700;
  font-size: 11px;
}

@media (max-width: 1024px) {
  .stat-cards {
    grid-template-columns: 1fr;
  }

  .table-card {
    overflow-x: auto;
  }
}
</style>
