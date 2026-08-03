import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Beat, BeatsFilters } from '@/types'
import { fetchBeats } from '@/api/beats'

export const useBeatsStore = defineStore('beats', () => {
  const beats = ref<Beat[]>([])
  const total = ref(0)
  const page = ref(1)
  const totalPages = ref(1)
  const loading = ref(false)
  const filters = ref<BeatsFilters>({})

  async function loadBeats(limit = 12) {
    loading.value = true
    try {
      const res = await fetchBeats({
        page: page.value,
        limit,
        ...filters.value
      })
      beats.value = res.beats
      total.value = res.total
      totalPages.value = res.totalPages
    } catch (err) {
      console.error('Failed to load beats:', err)
    } finally {
      loading.value = false
    }
  }

  function setFilter(key: keyof BeatsFilters, value: string | number | undefined) {
    if (value === undefined || value === '' || value === 0) {
      delete filters.value[key]
    } else {
      filters.value[key] = value as any
    }
    page.value = 1
  }

  function resetFilters() {
    filters.value = {}
    page.value = 1
  }

  function setPage(p: number) {
    page.value = p
  }

  return {
    beats,
    total,
    page,
    totalPages,
    loading,
    filters,
    loadBeats,
    setFilter,
    resetFilters,
    setPage
  }
})
