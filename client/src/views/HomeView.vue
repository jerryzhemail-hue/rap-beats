<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useBeatsStore } from '@/stores/beats'
import { useAuthStore } from '@/stores/auth'
import {
  fetchHomePublicData
} from '@/api/beats'
import { fetchHomeBanners } from '@/api/banners'
import SearchBar from '@/components/SearchBar.vue'
import BeatCard from '@/components/BeatCard.vue'
import HomeFooter from '@/components/HomeFooter.vue'
import type { Beat, Banner } from '@/types'

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const router = useRouter()
const beatsStore = useBeatsStore()
const authStore = useAuthStore()

const latestBeats = ref<Beat[]>([])
const popularBeats = ref<Beat[]>([])
const freeBeats = ref<Beat[]>([])
const banners = ref<Banner[]>([])
const rappers = ref<HomePublicResponse['rappers']>([])
const tags = ref<HomePublicResponse['tags']>([])
const forumPosts = ref<HomePublicResponse['forumPosts']>([])
const currentBannerIndex = ref(0)
const isHeroHovered = ref(false)
let bannerTimer: number | null = null

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

// ── 原有事件 ────────────────────────────────────────────────────

onMounted(async () => {
  const [homeRes, bannersRes] = await Promise.allSettled([
    fetchHomePublicData(),
    fetchHomeBanners()
  ])

  if (homeRes.status === 'fulfilled') {
    latestBeats.value = homeRes.value.latest.beats
    popularBeats.value = homeRes.value.popular.beats
    freeBeats.value = homeRes.value.free.beats
    rappers.value = homeRes.value.rappers || []
    tags.value = homeRes.value.tags || []
    forumPosts.value = homeRes.value.forumPosts || []
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

function onRapperClick(rapperId: number) {
  router.push(`/rapper/${rapperId}`)
}

function onTagClick(tag: string) {
  router.push({ path: '/beats', query: { tag } })
}

function onForumPostClick(postId: number) {
  router.push(`/forum/post/${postId}`)
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

    <!-- VIP 会员引导 Banner（未登录或非会员可见） -->
    <section v-if="!authStore.isVip" class="section">
      <router-link to="/vip" class="vip-banner">
        <div class="vip-banner-content">
          <span class="vip-banner-tag">💜 升级会员</span>
          <h3 class="vip-banner-title">解锁全部高品质伴奏 &amp; 无限下载</h3>
          <p class="vip-banner-desc">开通高级会员，畅享 VIP 专属内容与每日无限下载次数</p>
        </div>
        <div class="vip-banner-cta">立即开通 →</div>
      </router-link>
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

    <!-- 热门标签 -->
    <section v-if="tags.length > 0" class="section">
      <div class="section-header">
        <h2 class="section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          热门标签
        </h2>
      </div>
      <div class="tag-cloud">
        <button
          v-for="{ tag, count } in tags"
          :key="tag"
          class="tag-chip"
          @click="onTagClick(tag)"
        >
          {{ tag }}
          <span class="tag-count">{{ count }}</span>
        </button>
      </div>
    </section>

    <!-- 人气 Rapper -->
    <section v-if="rappers.length > 0" class="section">
      <div class="section-header">
        <h2 class="section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          人气 Rapper
        </h2>
        <router-link to="/beats" class="view-all">全部 →</router-link>
      </div>
      <div class="rapper-row">
        <div
          v-for="rapper in rappers"
          :key="rapper.id"
          class="rapper-card"
          @click="onRapperClick(rapper.id)"
        >
          <div class="rapper-avatar">
            <img v-if="rapper.avatar_url" :src="rapper.avatar_url" :alt="rapper.name" />
            <span v-else class="avatar-placeholder">{{rapper.name.charAt(0).toUpperCase()}}</span>
          </div>
          <div class="rapper-info">
            <span class="rapper-name">{{rapper.name}}</span>
            <span class="rapper-count">{{rapper.beat_count}} 首</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 社区动态 -->
    <section v-if="forumPosts.length > 0" class="section">
      <div class="section-header">
        <h2 class="section-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          社区动态
        </h2>
        <router-link to="/forum" class="view-all">更多 →</router-link>
      </div>
      <div class="forum-posts-list">
        <div
          v-for="post in forumPosts"
          :key="post.id"
          class="forum-post-item"
          @click="onForumPostClick(post.id)"
        >
          <div class="post-meta">
            <span class="post-author">{{ post.username }}</span>
            <span class="post-time">{{ formatDate(post.created_at) }}</span>
          </div>
          <h3 class="post-title">{{ post.title }}</h3>
          <div class="post-stats">
            <span class="stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {{ post.view_count }}
            </span>
            <span class="stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {{ post.reply_count }}
            </span>
            <span class="stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              {{ post.like_count }}
            </span>
          </div>
        </div>
      </div>
    </section>

  </div>

  <HomeFooter />
</template>

<style scoped>
.home {
  padding-bottom: 0;
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

/* VIP Banner */
.vip-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 28px;
  background: linear-gradient(135deg, #1a0533 0%, #2d1060 50%, #1a0533 100%);
  border: 1px solid rgba(124, 58, 237, 0.45);
  border-radius: var(--radius);
  text-decoration: none;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.vip-banner::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 70% 50%, rgba(124, 58, 237, 0.18) 0%, transparent 65%);
  pointer-events: none;
}

.vip-banner:hover {
  border-color: rgba(124, 58, 237, 0.7);
  transform: translateY(-1px);
  box-shadow: 0 8px 32px rgba(124, 58, 237, 0.28);
}

.vip-banner-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.vip-banner-tag {
  font-size: 12px;
  font-weight: 700;
  color: #c4b5fd;
  letter-spacing: 0.5px;
}

.vip-banner-title {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
}

.vip-banner-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.vip-banner-cta {
  flex-shrink: 0;
  padding: 10px 20px;
  background: linear-gradient(135deg, #7c3aed, #a855f7);
  border-radius: 999px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  transition: transform 0.2s ease;
}

.vip-banner:hover .vip-banner-cta {
  transform: scale(1.04);
}

/* Tag cloud */
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tag-chip:hover {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}

.tag-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  background: rgba(124, 58, 237, 0.15);
  padding: 1px 6px;
  border-radius: 999px;
}

/* Rapper row */
.rapper-row {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
  scrollbar-width: thin;
}

.rapper-card {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
  text-align: center;
}

.rapper-card:hover {
  border-color: var(--accent);
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(99, 58, 237, 0.18);
}

.rapper-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, var(--accent), #a855f7);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rapper-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rapper-avatar .avatar-placeholder {
  font-size: 24px;
  font-weight: 700;
  color: white;
}

.rapper-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rapper-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.rapper-count {
  font-size: 11px;
  color: var(--text-secondary);
}

/* Forum posts */
.forum-posts-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.forum-post-item {
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s ease;
}

.forum-post-item:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(99, 58, 237, 0.14);
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.post-author {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

.post-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.post-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 10px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.post-stats {
  display: flex;
  gap: 12px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.stat svg {
  opacity: 0.6;
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
}
</style>
