<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useBeatsStore } from '@/stores/beats'
import { fetchRappers } from '@/api/rappers'

export interface RapperItem {
  id: number
  name: string
  count: number
}

const router = useRouter()
const beatsStore = useBeatsStore()
const rappers = ref<RapperItem[]>([])
const loading = ref(false)
const error = ref('')

const selectedRapper = computed(() => beatsStore.filters.rapper || '')

onMounted(async () => {
  loading.value = true
  error.value = ''
  try {
    rappers.value = await fetchRappers()
  } catch (err: any) {
    error.value = err.message || '加载失败'
    console.error('Failed to load rappers:', err)
  } finally {
    loading.value = false
  }
})

function selectRapper(rapper: RapperItem, event: MouseEvent) {
  // Ctrl/Cmd + Click -> 打开详情页
  if (event.ctrlKey || event.metaKey) {
    window.open(`/rapper/${rapper.id}`, '_blank')
    return
  }
  // 普通点击 -> 筛选
  if (selectedRapper.value === rapper.name) {
    beatsStore.setFilter('rapper', undefined)
  } else {
    beatsStore.setFilter('rapper', rapper.name)
  }
  beatsStore.loadBeats()
}

function clearFilter() {
  beatsStore.setFilter('rapper', undefined)
  beatsStore.loadBeats()
}

function goToDetail(rapper: RapperItem, event: MouseEvent) {
  event.stopPropagation()
  router.push(`/rapper/${rapper.id}`)
}
</script>

<template>
  <div class="rapper-nav">
    <div class="rapper-nav-inner">
      <!-- Loading state -->
      <div v-if="loading" class="rapper-loading">
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="rapper-error">
        <button class="rapper-tag" @click="() => {}">
          <span class="rapper-name">重试</span>
        </button>
      </div>

      <!-- Rappers list -->
      <template v-else>
        <!-- All button -->
        <button
          class="rapper-tag"
          :class="{ active: !selectedRapper }"
          @click="clearFilter"
        >
          <span class="rapper-name">全部</span>
        </button>

        <!-- Rappers -->
        <button
          v-for="rapper in rappers"
          :key="rapper.name"
          class="rapper-tag"
          :class="{ active: selectedRapper === rapper.name }"
          @click="selectRapper(rapper, $event)"
        >
          <span class="rapper-name">{{ rapper.name }}</span>
          <span class="rapper-count">{{ rapper.count }}</span>
          <button class="rapper-info-btn" @click="goToDetail(rapper, $event)" title="查看详情">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.rapper-nav {
  width: 100%;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  overflow: hidden;
}

.rapper-nav-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
  max-width: 1200px;
  margin: 0 auto;
}

.rapper-nav-inner::-webkit-scrollbar {
  display: none;
}

.rapper-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.rapper-tag:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-light);
}

.rapper-tag.active {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.rapper-tag.active .rapper-count {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.rapper-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rapper-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.rapper-loading {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
}

.loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-secondary);
  opacity: 0.5;
  animation: pulse 1.4s infinite ease-in-out both;
}

.loading-dot:nth-child(1) {
  animation-delay: -0.32s;
}

.loading-dot:nth-child(2) {
  animation-delay: -0.16s;
}

.loading-dot:nth-child(3) {
  animation-delay: 0;
}

@keyframes pulse {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.rapper-error {
  padding: 6px 14px;
}

.rapper-info-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, background 0.2s;
}

.rapper-tag:hover .rapper-info-btn {
  opacity: 1;
}

.rapper-info-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
