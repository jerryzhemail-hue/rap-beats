<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchMyDownloads } from '@/api/user'
import { resolveCoverUrl } from '@/utils/assets'
import { formatDate } from '@/utils/format'

const router = useRouter()

// downloads
const downloads = ref<any[]>([])
const downloadsTotal = ref(0)
const downloadsPage = ref(1)
const downloadsTotalPages = ref(1)
const downloadsLoading = ref(false)


const defaultCover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#252540" width="200" height="200"/><text fill="#7c3aed" font-size="60" x="50%" y="55%" text-anchor="middle" dominant-baseline="middle">&#9835;</text></svg>')

async function loadDownloads() {
  downloadsLoading.value = true
  try {
    const data: any = await fetchMyDownloads(downloadsPage.value)
    downloads.value = data.downloads || []
    downloadsTotal.value = data.total || 0
    downloadsTotalPages.value = data.totalPages || 1
  } catch {
    downloads.value = []
  } finally {
    downloadsLoading.value = false
  }
}

watch(downloadsPage, loadDownloads)
onMounted(() => { loadDownloads() })
</script>

<template>
    <!-- 下载记录 -->
    <div class="tab-content">
      <div v-if="downloadsLoading" class="loading-state">加载中...</div>
      <div v-else-if="downloads.length === 0" class="empty-state">
        <span class="empty-icon">&#8595;</span>
        <p>还没有下载记录</p>
      </div>
      <div v-else>
        <div class="download-list">
          <div
            v-for="item in downloads"
            :key="item.id"
            class="download-item"
            @click="router.push(`/beats/${item.beat_id || item.id}`)"
          >
            <img
              class="dl-cover"
              :src="resolveCoverUrl(item.cover_image, defaultCover)"
              :alt="item.title"
            />
            <div class="dl-info">
              <p class="dl-title">{{ item.title }}</p>
              <p class="dl-producer">{{ item.producer }}</p>
            </div>
            <span class="dl-time">{{ formatDate(item.downloaded_at) }}</span>
          </div>
        </div>
        <div v-if="downloadsTotalPages > 1" class="pagination">
          <button class="page-btn" :disabled="downloadsPage <= 1" @click="downloadsPage--">上一页</button>
          <span class="page-info">{{ downloadsPage }} / {{ downloadsTotalPages }}</span>
          <button class="page-btn" :disabled="downloadsPage >= downloadsTotalPages" @click="downloadsPage++">下一页</button>
        </div>
      </div>
    </div>
</template>
