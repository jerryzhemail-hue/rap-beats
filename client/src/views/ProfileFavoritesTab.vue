<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import BeatCard from '@/components/BeatCard.vue'
import { fetchFavorites } from '@/api/favorites'
import type { Beat } from '@/types'

// favorites
const favorites = ref<Beat[]>([])
const favoritesTotal = ref(0)
const favoritesPage = ref(1)
const favoritesTotalPages = ref(1)
const favoritesLoading = ref(false)


async function loadFavorites() {
  favoritesLoading.value = true
  try {
    const data: any = await fetchFavorites(favoritesPage.value)
    favorites.value = (data.favorites || data.beats || []).map((b: any) => ({ ...b, is_favorited: true }))
    favoritesTotal.value = data.total || 0
    favoritesTotalPages.value = data.totalPages || 1
  } catch {
    favorites.value = []
  } finally {
    favoritesLoading.value = false
  }
}

watch(favoritesPage, loadFavorites)
onMounted(() => { loadFavorites() })
</script>

<template>
    <!-- 我的收藏 -->
    <div class="tab-content">
      <div v-if="favoritesLoading" class="loading-state">加载中...</div>
      <div v-else-if="favorites.length === 0" class="empty-state">
        <span class="empty-icon">&#10084;</span>
        <p>还没有收藏伴奏</p>
      </div>
      <div v-else>
        <div class="beats-grid">
          <BeatCard v-for="beat in favorites" :key="beat.id" :beat="beat" />
        </div>
        <div v-if="favoritesTotalPages > 1" class="pagination">
          <button class="page-btn" :disabled="favoritesPage <= 1" @click="favoritesPage--">上一页</button>
          <span class="page-info">{{ favoritesPage }} / {{ favoritesTotalPages }}</span>
          <button class="page-btn" :disabled="favoritesPage >= favoritesTotalPages" @click="favoritesPage++">下一页</button>
        </div>
      </div>
    </div>
</template>
