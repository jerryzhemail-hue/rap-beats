<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBeatsStore } from '@/stores/beats'
import { fetchRappers } from '@/api/rappers'

const beatsStore = useBeatsStore()
const BPM_MIN = 40
const BPM_MAX = 240
const bpmMin = ref<number | undefined>(beatsStore.filters.bpm_min)
const bpmMax = ref<number | undefined>(beatsStore.filters.bpm_max)
const selectedRapper = ref(beatsStore.filters.rapper || '')
const selectedKey = ref(beatsStore.filters.key || '')
const selectedSort = ref(beatsStore.filters.sort || '')
const isFree = ref(beatsStore.filters.is_free === 1)

// Rappers list
const rappers = ref<{ id: number; name: string; count: number }[]>([])
const loadingRappers = ref(false)

onMounted(async () => {
  loadingRappers.value = true
  try {
    rappers.value = await fetchRappers()
  } catch (err) {
    console.error('Failed to load rappers:', err)
  } finally {
    loadingRappers.value = false
  }
})

const keyOptions = ['Am', 'Cm', 'Em', 'Gm', 'Dm', 'Fm', 'Bm', 'C', 'D', 'E', 'F', 'G', 'A', 'B']

function normalizeBpmInput(value: number | undefined) {
  if (value === undefined || value === null || value === ('' as unknown as number) || Number.isNaN(Number(value))) {
    return undefined
  }
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(Number(value))))
}

function onRapperChange() {
  beatsStore.setFilter('rapper', selectedRapper.value || undefined)
  beatsStore.loadBeats()
}

function onKeyChange() {
  beatsStore.setFilter('key', selectedKey.value || undefined)
  beatsStore.loadBeats()
}

function onBpmChange() {
  const normalizedMin = normalizeBpmInput(bpmMin.value)
  const normalizedMax = normalizeBpmInput(bpmMax.value)

  if (normalizedMin !== undefined && normalizedMax !== undefined && normalizedMin > normalizedMax) {
    bpmMin.value = normalizedMax
    bpmMax.value = normalizedMin
  } else {
    bpmMin.value = normalizedMin
    bpmMax.value = normalizedMax
  }

  beatsStore.setFilter('bpm_min', bpmMin.value)
  beatsStore.setFilter('bpm_max', bpmMax.value)
  beatsStore.loadBeats()
}

function onSortChange() {
  beatsStore.setFilter('sort', selectedSort.value || undefined)
  beatsStore.loadBeats()
}

function onFreeChange() {
  beatsStore.setFilter('is_free', isFree.value ? 1 : undefined)
  beatsStore.loadBeats()
}

function onReset() {
  selectedRapper.value = ''
  selectedKey.value = ''
  selectedSort.value = ''
  isFree.value = false
  bpmMin.value = undefined
  bpmMax.value = undefined
  beatsStore.resetFilters()
  beatsStore.loadBeats()
}
</script>

<template>
  <div class="filter-bar">
    <div class="filter-item">
      <label>排序</label>
      <select v-model="selectedSort" @change="onSortChange">
        <option value="">最新</option>
        <option value="popular">最热门</option>
      </select>
    </div>
    <div class="filter-item">
      <label>Rapper</label>
      <select v-model="selectedRapper" @change="onRapperChange" :disabled="loadingRappers">
        <option value="">全部</option>
        <option v-for="r in rappers" :key="r.name" :value="r.name">{{ r.name }}</option>
      </select>
    </div>
    <div class="filter-item">
      <label>BPM</label>
      <div class="bpm-range">
        <input
          v-model.number="bpmMin"
          type="number"
          placeholder="最低"
          :min="BPM_MIN"
          :max="BPM_MAX"
          @change="onBpmChange"
        />
        <span class="bpm-sep">-</span>
        <input
          v-model.number="bpmMax"
          type="number"
          placeholder="最高"
          :min="BPM_MIN"
          :max="BPM_MAX"
          @change="onBpmChange"
        />
      </div>
    </div>
    <div class="filter-item">
      <label>调性</label>
      <select v-model="selectedKey" @change="onKeyChange">
        <option value="">全部</option>
        <option v-for="k in keyOptions" :key="k" :value="k">{{ k }}</option>
      </select>
    </div>
    <button class="btn-reset" @click="onReset">重置</button>
    <label class="free-toggle">
      <input type="checkbox" v-model="isFree" @change="onFreeChange" />
      <span>仅免费</span>
    </label>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-item label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-item select,
.filter-item input {
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.filter-item select:focus,
.filter-item input:focus {
  border-color: var(--accent);
}

.filter-item select {
  min-width: 120px;
  cursor: pointer;
}

.filter-item select option {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.bpm-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bpm-range input {
  width: 80px;
}

.bpm-sep {
  color: var(--text-secondary);
}

.btn-reset {
  padding: 8px 20px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  height: 38px;
}

.btn-reset:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.free-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  user-select: none;
  height: 38px;
}

.free-toggle input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-item select {
    min-width: unset;
    width: 100%;
  }

  .bpm-range input {
    flex: 1;
  }
}
</style>
