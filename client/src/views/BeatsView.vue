<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBeatsStore } from '@/stores/beats'
import { fetchRappers } from '@/api/rappers'
import SearchBar from '@/components/SearchBar.vue'
import FilterBar from '@/components/FilterBar.vue'
import BeatCard from '@/components/BeatCard.vue'
import RapperChannel from '@/components/RapperChannel.vue'

const route = useRoute()
const router = useRouter()
const beatsStore = useBeatsStore()
const activeTab = ref<'all' | 'rappers'>('all')
const searchQuery = ref('')
const rappers = ref<any[]>([])
const rappersLoading = ref(false)

// Check if search is active
const isSearchActive = computed(() => searchQuery.value.length > 0)

// Filtered rappers based on search
const filteredRappers = computed(() => {
  if (!searchQuery.value) return []
  const query = searchQuery.value.toLowerCase()
  return rappers.value.filter(r => 
    r.name.toLowerCase().includes(query) ||
    (r.bio && r.bio.toLowerCase().includes(query))
  )
})

// Check if filtered beats match any rapper
const filteredBeats = computed(() => {
  if (!searchQuery.value) return beatsStore.beats
  const query = searchQuery.value.toLowerCase()
  return beatsStore.beats.filter(beat => {
    // 匹配 rapper 名字
    const rapperMatch = beat.rapper?.toLowerCase().includes(query)
    // 匹配标题
    const titleMatch = beat.title?.toLowerCase().includes(query)
    // 匹配制作人
    const producerMatch = beat.producer?.toLowerCase().includes(query)
    // 匹配标签（可能是数组或JSON字符串）
    let tagsMatch = false
    if (beat.tags) {
      if (Array.isArray(beat.tags)) {
        tagsMatch = beat.tags.some((t: string) => t.toLowerCase().includes(query))
      } else if (typeof beat.tags === 'string') {
        try {
          const tagsArray = JSON.parse(beat.tags)
          if (Array.isArray(tagsArray)) {
            tagsMatch = tagsArray.some((t: string) => t.toLowerCase().includes(query))
          }
        } catch {
          tagsMatch = (beat.tags as string).toLowerCase().includes(query)
        }
      }
    }
    return rapperMatch || titleMatch || producerMatch || tagsMatch
  })
})

onMounted(async () => {
  // Read initial query params
  if (route.query.genre) {
    beatsStore.setFilter('genre', route.query.genre as string)
  }
  if (route.query.rapper) {
    beatsStore.setFilter('rapper', route.query.rapper as string)
  }
  if (route.query.sort) {
    beatsStore.setFilter('sort', route.query.sort as string)
  }
  if (route.query.is_free === '1') {
    beatsStore.setFilter('is_free', 1)
  }
  if (route.query.tag) {
    beatsStore.setFilter('tag', route.query.tag as string)
  }
  beatsStore.loadBeats()
  await loadRappers()
})

// Watch route query changes
watch(() => route.query, (query) => {
  let changed = false
  if (query.genre && query.genre !== beatsStore.filters.genre) {
    beatsStore.setFilter('genre', query.genre as string)
    changed = true
  }
  if (query.rapper && query.rapper !== beatsStore.filters.rapper) {
    beatsStore.setFilter('rapper', query.rapper as string)
    changed = true
  }
  if (query.sort !== undefined && query.sort !== beatsStore.filters.sort) {
    beatsStore.setFilter('sort', query.sort as string || undefined)
    changed = true
  }
  if (query.is_free !== undefined) {
    const newIsFree = query.is_free === '1' ? 1 : undefined
    if (newIsFree !== beatsStore.filters.is_free) {
      beatsStore.setFilter('is_free', newIsFree)
      changed = true
    }
  }
  if (query.tag && query.tag !== beatsStore.filters.tag) {
    beatsStore.setFilter('tag', query.tag as string)
    changed = true
  }
  if (changed) beatsStore.loadBeats()
})

watch(() => beatsStore.page, () => {
  beatsStore.loadBeats()
})

async function loadRappers() {
  try {
    rappersLoading.value = true
    const res = await fetchRappers()
    rappers.value = res || []
  } catch (e) {
    console.error('Failed to load rappers:', e)
  } finally {
    rappersLoading.value = false
  }
}

function onSearch(query: string) {
  searchQuery.value = query
  if (query) {
    beatsStore.setFilter('search', query)
  } else {
    beatsStore.setFilter('search', undefined)
  }
  beatsStore.loadBeats()
}

function goToPage(p: number) {
  if (p < 1 || p > beatsStore.totalPages) return
  beatsStore.setPage(p)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function switchTab(tab: 'all' | 'rappers') {
  activeTab.value = tab
  if (tab === 'all') {
    // Clear rapper filter when switching to all
    beatsStore.setFilter('rapper', undefined)
    beatsStore.loadBeats()
  }
}

function goToRapper(id: number) {
  router.push(`/rapper/${id}`)
}
</script>

<template>
  <div class="beats-view">
    <!-- Header -->
    <div class="beats-header">
      <div class="header-top">
        <h1 class="page-title">伴奏库</h1>
        <SearchBar @search="onSearch" />
      </div>
      
      <!-- Tab Navigation -->
      <div class="tab-nav">
        <button 
          class="tab-btn"
          :class="{ active: activeTab === 'all' }"
          @click="switchTab('all')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
          全部伴奏
        </button>
        <button 
          class="tab-btn"
          :class="{ active: activeTab === 'rappers' }"
          @click="switchTab('rappers')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Rapper 频道
        </button>
      </div>
    </div>

    <!-- All Beats Tab -->
    <template v-if="activeTab === 'all'">
      <FilterBar />

      <!-- Search Results: Rappers Section -->
      <div v-if="isSearchActive && filteredRappers.length > 0" class="search-section">
        <div class="section-header">
          <h2 class="section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            相关 Rapper
          </h2>
          <span class="section-count">{{ filteredRappers.length }} 位</span>
        </div>
        <div class="rapper-results-grid">
          <div
            v-for="rapper in filteredRappers"
            :key="rapper.id"
            class="rapper-result-card"
            @click="goToRapper(rapper.id)"
          >
            <div class="rapper-result-avatar">
              <img v-if="rapper.avatar_url" :src="rapper.avatar_url" :alt="rapper.name" />
              <span v-else class="avatar-placeholder">{{ rapper.name.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="rapper-result-info">
              <h3 class="rapper-result-name">{{ rapper.name }}</h3>
              <p class="rapper-result-count">{{ rapper.count }} 首伴奏</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="beatsStore.loading" class="beats-grid">
        <div v-for="n in 8" :key="n" class="skeleton-card">
          <div class="skeleton skeleton-cover"></div>
          <div class="skeleton-card-info">
            <div class="skeleton skeleton-text" style="width: 70%"></div>
            <div class="skeleton skeleton-text" style="width: 50%"></div>
          </div>
        </div>
      </div>

      <!-- Content -->
      <template v-else>
        <!-- Search Results: Beats Section -->
        <div v-if="isSearchActive" class="search-section">
          <div class="section-header">
            <h2 class="section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18V5l12-2v13"/>
                <circle cx="6" cy="18" r="3"/>
                <circle cx="18" cy="16" r="3"/>
              </svg>
              相关伴奏
            </h2>
            <span class="section-count">{{ filteredBeats.length }} 首</span>
          </div>
        </div>

        <div v-if="filteredBeats.length === 0" class="empty-state">
          <div class="empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
          </div>
          <p>没有找到匹配的伴奏</p>
          <button class="btn btn-outline" @click="beatsStore.resetFilters(); onSearch('')">
            重置筛选
          </button>
        </div>

        <div v-else class="beats-grid">
          <BeatCard
            v-for="beat in filteredBeats"
            :key="beat.id"
            :beat="beat"
          />
        </div>

        <!-- Pagination -->
        <div v-if="beatsStore.totalPages > 1 && !isSearchActive" class="pagination">
          <button
            class="page-btn"
            :disabled="beatsStore.page <= 1"
            @click="goToPage(beatsStore.page - 1)"
          >
            ‹
          </button>
          <template v-for="p in beatsStore.totalPages" :key="p">
            <button
              v-if="p === 1 || p === beatsStore.totalPages || Math.abs(p - beatsStore.page) <= 1"
              class="page-btn"
              :class="{ active: p === beatsStore.page }"
              @click="goToPage(p)"
            >
              {{ p }}
            </button>
            <span v-else-if="Math.abs(p - beatsStore.page) === 2" class="page-dots">...</span>
          </template>
          <button
            class="page-btn"
            :disabled="beatsStore.page >= beatsStore.totalPages"
            @click="goToPage(beatsStore.page + 1)"
          >
            ›
          </button>
        </div>
      </template>
    </template>

    <!-- Rapper Channel Tab -->
    <RapperChannel v-else />
  </div>
</template>

<style scoped>
.beats-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
}

.beats-header {
  margin-bottom: 24px;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 24px;
  flex-wrap: wrap;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
}

.tab-nav {
  display: flex;
  gap: 8px;
  padding: 4px;
  background: var(--bg-card);
  border-radius: 12px;
  width: fit-content;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--accent);
  color: white;
}

.tab-btn svg {
  flex-shrink: 0;
}

.beats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-top: 24px;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-secondary);
}

.empty-icon {
  opacity: 0.3;
  margin-bottom: 16px;
}

.empty-state p {
  font-size: 16px;
  margin-bottom: 16px;
}

/* Skeleton */
.skeleton-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  overflow: hidden;
}

.skeleton-cover {
  aspect-ratio: 1;
}

.skeleton-card-info {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-text {
  height: 14px;
}

/* Search Results Sections */
.search-section {
  margin-bottom: 32px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.section-title svg {
  color: var(--accent);
}

.section-count {
  font-size: 14px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 4px 12px;
  border-radius: 20px;
}

/* Rapper Results Grid */
.rapper-results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.rapper-result-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.rapper-result-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.15);
}

.rapper-result-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, var(--accent), #a855f7);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rapper-result-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rapper-result-avatar .avatar-placeholder {
  font-size: 18px;
  font-weight: 700;
  color: white;
}

.rapper-result-info {
  flex: 1;
  min-width: 0;
}

.rapper-result-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rapper-result-count {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-top: 40px;
}

.page-btn {
  min-width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.page-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-dots {
  color: var(--text-secondary);
  font-size: 14px;
  padding: 0 4px;
}

@media (max-width: 1024px) {
  .beats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .beats-view {
    padding: 20px 16px;
  }
  
  .header-top {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .tab-nav {
    width: 100%;
  }
  
  .tab-btn {
    flex: 1;
    justify-content: center;
  }
  
  .beats-grid {
    grid-template-columns: 1fr;
  }
  
  .rapper-results-grid {
    grid-template-columns: 1fr;
  }
  
  .section-title {
    font-size: 16px;
  }
}
</style>
