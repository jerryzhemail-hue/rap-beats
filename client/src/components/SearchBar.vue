<script setup lang="ts">
import { ref, watch } from 'vue'

const emit = defineEmits<{
  search: [value: string]
}>()

const query = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    emit('search', val)
  }, 300)
})
</script>

<template>
  <div class="search-bar">
    <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <input
      v-model="query"
      type="text"
      placeholder="搜索伴奏名称、制作人..."
      class="search-input"
    />
  </div>
</template>

<style scoped>
.search-bar {
  position: relative;
  width: 100%;
  max-width: 480px;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 12px 16px 12px 44px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.search-input::placeholder {
  color: var(--text-secondary);
}

.search-input:focus {
  border-color: var(--accent);
}
</style>
