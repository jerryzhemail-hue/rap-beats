<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useBeatsStore } from '@/stores/beats'
import { fetchHomePublicData } from '@/api/beats'
import { fetchHomeBanners } from '@/api/banners'
import {
  defaultGenreCategoryValue,
  genreCategoryOptions,
  getGenreChildrenByCategory
} from '@/constants/genres'
import SearchBar from '@/components/SearchBar.vue'
import BeatCard from '@/components/BeatCard.vue'
import type { Beat, Banner } from '@/types'

const router = useRouter()
const beatsStore = useBeatsStore()

const latestBeats = ref<Beat[]>([])
const popularBeats = ref<Beat[]>([])
const freeBeats = ref<Beat[]>([])
const banners = ref<Banner[]>([])
const currentBannerIndex = ref(0)
const isHeroHovered = ref(false)
const selectedGenreCategory = ref(defaultGenreCategoryValue)
const showAllHomeGenres = ref(false)
let bannerTimer: number | null = null

const homeGenreChildren = computed(() => getGenreChildrenByCategory(selectedGenreCategory.value))
const homeVisibleGenres = computed(() => {
  if (showAllHomeGenres.value) return homeGenreChildren.value
  return homeGenreChildren.value.slice(0, 6)
})
const homeHasMoreGenres = computed(() => homeGenreChildren.value.length > 6)
const homeGenreSummary = computed(() => {
  const currentCategory = genreCategoryOptions.find((item) => item.value === selectedGenreCategory.value)
  if (!currentCategory) return ''
  return currentCategory.children.slice(0, 3).map((item) => item.label).join(' / ')
})

function clearBannerTimer() {
  if (bannerTimer !== null) {
    window.clearTimeout(bannerTimer)
    bannerTimer = null
  }
}

function scheduleNextBanner() {
  clearBannerTimer()

  if (banners.value.length <= 1) {
    currentBannerIndex.value = 0
    return
  }

  if (isHeroHovered.value) {
    return
  }

  const duration = Math.max(banners.value[currentBannerIndex.value]?.display_duration || 5, 2) * 1000
  bannerTimer = window.setTimeout(() => {
    currentBannerIndex.value = (currentBannerIndex.value + 1) % banners.value.length
  }, duration)
}

function setBanner(index: number) {
  currentBannerIndex.value = index
}

function showPrevBanner() {
  if (banners.value.length <= 1) return
  currentBannerIndex.value = (currentBannerIndex.value - 1 + banners.value.length) % banners.value.length
}

function showNextBanner() {
  if (banners.value.length <= 1) return
  currentBannerIndex.value = (currentBannerIndex.value + 1) % banners.value.length
}

function pauseBannerAutoplay() {
  isHeroHovered.value = true
  clearBannerTimer()
}

function resumeBannerAutoplay() {
  isHeroHovered.value = false
  scheduleNextBanner()
}

onMounted(async () => {
  const [homeRes, bannersRes] = await Promise.allSettled([
    fetchHomePublicData(),
    fetchHomeBanners()
  ])

  if (homeRes.status === 'fulfilled') {
    latestBeats.value = homeRes.value.latest.beats
    popularBeats.value = homeRes.value.popular.beats
    freeBeats.value = homeRes.value.free.beats
  } else {
    console.error('Failed to load home data:', homeRes.reason)
  }

  if (bannersRes.status === 'fulfilled') {
    banners.value = bannersRes.value.banners
  } else {
    console.error('Failed to load banners:', bannersRes.reason)
  }
})

watch([banners, currentBannerIndex, isHeroHovered], () => {
  scheduleNextBanner()
})

watch(selectedGenreCategory, () => {
  showAllHomeGenres.value = false
})

onUnmounted(() => {
  clearBannerTimer()
})

function onSearch(query: string) {
  beatsStore.setFilter('search', query || undefined)
  router.push('/beats')
}

function onGenreClick(genre: string) {
  beatsStore.setFilter('genre', genre)
  router.push('/beats')
}
</script>

<template>
  <div class="home">
    <section class="hero">
      <div
        class="hero-slider"
        :class="{ 'has-banner': banners.length > 0 }"
        @mouseenter="pauseBannerAutoplay"
        @mouseleave="resumeBannerAutoplay"
      >
        <div v-if="banners.length > 0" class="hero-slides">
          <a
            v-for="(banner, index) in banners"
            :key="banner.id"
            class="hero-slide"
            :class="{ active: index === currentBannerIndex }"
            :href="banner.link_url || undefined"
            :target="banner.link_url ? '_self' : undefined"
            :style="{
              backgroundImage: `linear-gradient(rgba(7, 10, 20, ${banner.overlay_opacity / 100}), rgba(7, 10, 20, 0.72)), url(${banner.image_url})`
            }"
            :aria-hidden="index !== currentBannerIndex"
            tabindex="-1"
          ></a>
        </div>

        <div v-if="banners.length > 1" class="hero-arrows">
          <button type="button" class="hero-arrow hero-arrow-left" aria-label="上一张 Banner" @click="showPrevBanner">
            ‹
          </button>
          <button type="button" class="hero-arrow hero-arrow-right" aria-label="下一张 Banner" @click="showNextBanner">
            ›
          </button>
        </div>

        <div class="hero-content">
          <h1 class="hero-title">发现你的下一个Beat</h1>
          <p class="hero-subtitle">海量高品质说唱伴奏，为你的创作注入灵感</p>
          <SearchBar @search="onSearch" />
        </div>

        <div v-if="banners.length > 1" class="hero-dots">
          <button
            v-for="(banner, index) in banners"
            :key="banner.id"
            type="button"
            class="hero-dot"
            :class="{ active: index === currentBannerIndex }"
            :aria-label="`切换到 Banner ${index + 1}`"
            @click="setBanner(index)"
          ></button>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h2 class="section-title">最新伴奏</h2>
        <router-link to="/beats" class="view-all">查看全部 →</router-link>
      </div>
      <div class="beats-grid">
        <BeatCard
          v-for="beat in latestBeats"
          :key="beat.id"
          :beat="beat"
        />
      </div>
    </section>
    
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">本周热榜</h2>
        <router-link to="/beats?sort=popular" class="view-all">查看更多 →</router-link>
      </div>
      <div class="beats-grid">
        <BeatCard
          v-for="(beat, index) in popularBeats"
          :key="beat.id"
          :beat="beat"
          :rank="index + 1"
        />
      </div>
    </section>
    
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">🎁 免费Beat专区</h2>
        <router-link to="/beats?is_free=1" class="view-all">查看更多 →</router-link>
      </div>
      <div class="beats-grid">
        <BeatCard
          v-for="beat in freeBeats"
          :key="beat.id"
          :beat="beat"
        />
      </div>
    </section>

    <section class="section">
      <div class="section-header genre-section-header">
        <div>
          <h2 class="section-title">风格分类</h2>
          <p class="section-subtitle">先切换一级风格，再选择你想浏览的细分风格。</p>
          <p class="genre-category-summary">当前分类示例：{{ homeGenreSummary }}</p>
        </div>
      </div>
      <div class="genre-category-tabs">
        <button
          v-for="category in genreCategoryOptions"
          :key="category.value"
          class="genre-category-tab"
          :class="{ active: category.value === selectedGenreCategory }"
          @click="selectedGenreCategory = category.value"
        >
          {{ category.label }}
        </button>
      </div>
      <div class="genre-tags">
        <button
          v-for="genre in homeVisibleGenres"
          :key="genre.value"
          class="genre-chip"
          @click="onGenreClick(genre.value)"
        >
          {{ genre.label }}
        </button>
      </div>
      <div v-if="homeHasMoreGenres" class="genre-more">
        <button class="genre-more-btn" @click="showAllHomeGenres = !showAllHomeGenres">
          {{ showAllHomeGenres ? '收起' : '查看更多' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  padding-bottom: 40px;
}

.hero {
  position: relative;
  height: 420px;
  overflow: hidden;
}

.hero-slider {
  position: relative;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
}

.hero-slides {
  position: absolute;
  inset: 0;
  width: 100vw;
  left: 50%;
  transform: translateX(-50%);
}

.hero-slide {
  position: absolute;
  inset: 0;
  display: block;
  opacity: 0;
  pointer-events: none;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  transition: opacity 0.8s ease;
}

.hero-slide.active {
  opacity: 1;
  pointer-events: auto;
}

.hero-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 600px;
  height: 100%;
  margin: 0 auto;
  padding: 32px 24px;
  text-align: center;
  border-radius: 16px;
}

.hero-title {
  font-size: 48px;
  font-weight: 800;
  margin: 0 0 16px;
  line-height: 1.1;
  letter-spacing: -1px;
  color: #ffffff;
}

.hero-subtitle {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0 0 32px;
}

.hero :deep(.search-bar) {
  max-width: 100%;
  margin: 0 auto;
}

.hero-dots {
  position: absolute;
  z-index: 3;
  left: 50%;
  bottom: 28px;
  display: flex;
  gap: 10px;
  transform: translateX(-50%);
}

.hero-arrows {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.hero-arrow {
  position: absolute;
  top: 50%;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 999px;
  background: rgba(15, 18, 28, 0.46);
  color: #fff;
  font-size: 32px;
  line-height: 1;
  transform: translateY(-50%);
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.2s ease, transform 0.2s ease;
}

.hero-arrow:hover {
  background: rgba(15, 18, 28, 0.72);
  transform: translateY(-50%) scale(1.04);
}

.hero-arrow-left {
  left: 32px;
}

.hero-arrow-right {
  right: 32px;
}

.hero-dot {
  width: 10px;
  height: 10px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  transition: all 0.2s ease;
}

.hero-dot.active {
  width: 28px;
  border-radius: 999px;
  background: #fff;
}

.section {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 24px 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.section-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.section-subtitle {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.genre-category-summary {
  margin: 8px 0 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
}

.view-all {
  font-size: 14px;
  color: var(--accent);
  transition: color 0.2s ease;
}

.view-all:hover {
  color: var(--accent-hover);
}

.beats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.genre-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.genre-category-tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: thin;
}

.genre-category-tab {
  flex: 0 0 auto;
  padding: 10px 18px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.genre-category-tab:hover,
.genre-category-tab.active {
  border-color: var(--accent);
  background: rgba(124, 58, 237, 0.16);
  color: var(--text-primary);
}

.genre-chip {
  padding: 10px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.genre-chip:hover {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}

.genre-more {
  margin-top: 16px;
}

.genre-more-btn {
  padding: 10px 18px;
  border: 1px solid rgba(124, 58, 237, 0.35);
  border-radius: 999px;
  background: transparent;
  color: #c4b5fd;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.genre-more-btn:hover {
  border-color: var(--accent);
  background: rgba(124, 58, 237, 0.12);
  color: #ddd6fe;
}

@media (max-width: 1024px) {
  .beats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .hero-title {
    font-size: 36px;
  }
}

@media (max-width: 640px) {
  .beats-grid {
    grid-template-columns: 1fr;
  }

  .hero {
    height: 560px;
  }

  .hero-content {
    padding: 0 16px;
  }

  .hero-title {
    font-size: 28px;
  }

  .hero-subtitle {
    font-size: 15px;
  }

  .hero-dots {
    bottom: 20px;
  }

  .hero-arrow {
    width: 38px;
    height: 38px;
    font-size: 28px;
  }

  .hero-arrow-left {
    left: 12px;
  }

  .hero-arrow-right {
    right: 12px;
  }

  .genre-category-tabs {
    gap: 10px;
  }

  .genre-category-tab {
    width: auto;
    text-align: center;
  }

  .genre-chip {
    width: 100%;
    text-align: center;
  }

  .genre-more-btn {
    width: 100%;
  }
}
</style>
