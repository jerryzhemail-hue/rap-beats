<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchBeatmakerBeats, fetchBeatmakerProfile, type BeatmakerProfile } from '@/api/beatmaker';
import { addFavorite, removeFavorite } from '@/api/favorites';
import { followUser, unfollowUser, ensureConversation, type ForumConversation } from '@/api/forum';
import { useAuthStore } from '@/stores/auth';
import BeatmakerBadge from '@/components/BeatmakerBadge.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const profile = ref<BeatmakerProfile | null>(null);
const loading = ref(false);
const error = ref('');
const beats = ref<any[]>([]);
const beatsTotal = ref(0);
const beatsPage = ref(1);
const beatsLoading = ref(false);

// ─── 音频播放 ───────────────────────────────────────────────────────
const audioEl = ref<HTMLAudioElement | null>(null);
const playingBeatId = ref<number | null>(null);
const currentTime = ref(0);
const duration = ref(0);
const playProgressTimer = ref<number | null>(null);

function playBeat(beat: any) {
  if (!audioEl.value) return;
  if (playingBeatId.value === beat.id) {
    // 暂停 / 恢复
    if (audioEl.value.paused) {
      audioEl.value.play();
    } else {
      audioEl.value.pause();
    }
    return;
  }
  // 切换新曲目
  audioEl.value.pause();
  audioEl.value.src = beat.preview_audio_url || beat.audio_url || '';
  audioEl.value.load();
  audioEl.value.play().catch(() => {});
  playingBeatId.value = beat.id;
}

function stopPlayback() {
  if (audioEl.value) {
    audioEl.value.pause();
    audioEl.value.currentTime = 0;
  }
  playingBeatId.value = null;
}

function onAudioTimeUpdate() {
  if (!audioEl.value) return;
  currentTime.value = audioEl.value.currentTime;
  duration.value = audioEl.value.duration || 0;
}

function onAudioEnded() {
  playingBeatId.value = null;
  currentTime.value = 0;
}

function formatTime(sec: number) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function progressPercent() {
  if (!duration.value) return 0;
  return Math.min(100, (currentTime.value / duration.value) * 100);
}

// ─── 加载数据 ───────────────────────────────────────────────────────
async function loadProfile() {
  const userId = Number(route.params.userId);
  if (!userId) {
    router.push('/beatmakers');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const data = await fetchBeatmakerProfile(userId);
    profile.value = data.profile;
    loadBeats(true);
  } catch (err: any) {
    error.value = err.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadBeats(reset = false) {
  if (!profile.value) return;
  if (reset) {
    beatsPage.value = 1;
    beats.value = [];
  }
  beatsLoading.value = true;
  try {
    const data = await fetchBeatmakerBeats(profile.value.user_id, beatsPage.value, 10);
    beats.value = reset ? data.beats : [...beats.value, ...data.beats];
    beatsTotal.value = data.total;
  } finally {
    beatsLoading.value = false;
  }
}

const hasMoreBeats = computed(() => beats.value.length < beatsTotal.value);
function loadMoreBeats() {
  if (beatsLoading.value || !hasMoreBeats.value) return;
  beatsPage.value += 1;
  loadBeats();
}

onMounted(() => {
  loadProfile();
});

onUnmounted(() => {
  stopPlayback();
  if (playProgressTimer.value) window.clearInterval(playProgressTimer.value);
});

// ─── 互动：点赞（收藏）、关注、私信 ─────────────────────────────────
const busyingFavId = ref<number | null>(null);
async function toggleFavorite(beat: any) {
  if (!authStore.isAuthenticated) {
    router.push({ path: '/login', query: { redirect: route.fullPath, requireAuth: '1' } });
    return;
  }
  busyingFavId.value = beat.id;
  try {
    if (beat.is_favorited) {
      await removeFavorite(beat.id);
      beat.is_favorited = false;
      beat.favorite_count = Math.max(0, (beat.favorite_count ?? 0) - 1);
    } else {
      await addFavorite(beat.id);
      beat.is_favorited = true;
      beat.favorite_count = (beat.favorite_count ?? 0) + 1;
    }
  } finally {
    busyingFavId.value = null;
  }
}

const followingBusy = ref(false);
async function toggleFollow() {
  if (!profile.value) return;
  if (!authStore.isAuthenticated) {
    router.push({ path: '/login', query: { redirect: route.fullPath, requireAuth: '1' } });
    return;
  }
  if (profile.value.is_self) return;
  followingBusy.value = true;
  try {
    if (profile.value.is_following) {
      await unfollowUser(profile.value.user_id);
      profile.value.is_following = false;
      profile.value.follower_count = Math.max(0, profile.value.follower_count - 1);
    } else {
      await followUser(profile.value.user_id);
      profile.value.is_following = true;
      profile.value.follower_count += 1;
    }
  } finally {
    followingBusy.value = false;
  }
}

async function sendDirectMessage() {
  if (!profile.value) return;
  if (!authStore.isAuthenticated) {
    router.push({ path: '/login', query: { redirect: route.fullPath, requireAuth: '1' } });
    return;
  }
  if (profile.value.is_self) return;
  try {
    const conv: ForumConversation = await ensureConversation(profile.value.user_id);
    router.push(`/forum/messages/${encodeURIComponent(conv.id)}`);
  } catch (e: any) {
    error.value = e.message || '发起私信失败';
  }
}
</script>

<template>
  <div class="profile-page">
    <audio ref="audioEl" @timeupdate="onAudioTimeUpdate" @ended="onAudioEnded" @loadedmetadata="onAudioTimeUpdate"></audio>

    <div v-if="loading" class="state">加载中…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>

    <template v-else-if="profile">
      <!-- ─── 档案头部 ────────────────────────────────────────────── -->
      <section class="hero-card">
        <div class="hero-bg"></div>
        <div class="hero-inner">
          <div class="hero-left">
            <div class="avatar-wrap">
              <img v-if="profile.avatar_url" :src="profile.avatar_url" :alt="profile.display_name" />
              <div v-else class="avatar-placeholder">{{ profile.display_name.charAt(0) }}</div>
              <BeatmakerBadge size="md" variant="solid" :show-label="false" />
            </div>
            <div class="hero-info">
              <div class="hero-name-row">
                <h1>{{ profile.display_name }}</h1>
                <BeatmakerBadge size="sm" variant="subtle" />
              </div>
              <p class="hero-username">@{{ profile.username }}</p>
              <p v-if="profile.certified_at" class="hero-cert">
                认证于 {{ new Date(profile.certified_at).toLocaleDateString('zh-CN') }}
              </p>
              <p v-if="profile.bio" class="hero-bio">{{ profile.bio }}</p>
              <div class="hero-links">
                <a v-if="profile.portfolio_url" :href="profile.portfolio_url" target="_blank" rel="noopener" class="link-btn">
                  🔗 外部作品集
                </a>
                <a v-if="profile.sample_audio_url" :href="profile.sample_audio_url" target="_blank" rel="noopener" class="link-btn">
                  🎧 代表作音频
                </a>
              </div>
            </div>
          </div>

          <div class="hero-right">
            <div class="stats-grid">
              <div class="stat">
                <span class="stat-value">{{ profile.total_beats }}</span>
                <span class="stat-label">原创作品</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ profile.total_likes }}</span>
                <span class="stat-label">累计点赞</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ profile.total_downloads }}</span>
                <span class="stat-label">累计下载</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ profile.follower_count }}</span>
                <span class="stat-label">粉丝</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ profile.following_count }}</span>
                <span class="stat-label">关注</span>
              </div>
            </div>
            <div class="action-row">
              <template v-if="!profile.is_self">
                <button
                  class="btn-primary"
                  :class="{ active: profile.is_following }"
                  :disabled="followingBusy"
                  @click="toggleFollow"
                >
                  <span v-if="profile.is_following">✔ 已关注</span>
                  <span v-else>+ 关注</span>
                </button>
                <button class="btn-outline" @click="sendDirectMessage">
                  💬 私信交流
                </button>
              </template>
              <template v-else>
                <button class="btn-outline" @click="router.push('/upload')">
                  ⬆ 上传新作品
                </button>
                <button class="btn-outline" @click="router.push(`/beatmaker/profile/${profile.user_id}`)">
                  ✏ 编辑资料
                </button>
              </template>
            </div>
          </div>
        </div>
      </section>

      <!-- ─── 作品集 ──────────────────────────────────────────────── -->
      <section class="beats-section">
        <div class="section-head">
          <h2>原创作品集</h2>
          <span class="count-pill">共 {{ beatsTotal }} 首</span>
        </div>

        <div v-if="beats.length === 0 && !beatsLoading" class="empty">
          <div class="empty-emoji">🎵</div>
          <p>暂无原创作品</p>
        </div>

        <ul v-else class="beat-list">
          <li v-for="beat in beats" :key="beat.id" class="beat-row">
            <div class="beat-cover" @click="playBeat(beat)">
              <img v-if="beat.cover_image" :src="beat.cover_image" :alt="beat.title" />
              <div v-else class="cover-placeholder">🎧</div>
              <div class="play-mask">
                <div v-if="playingBeatId === beat.id" class="playing-icon">
                  <span></span><span></span><span></span>
                </div>
                <span v-else class="play-triangle">▶</span>
              </div>
            </div>

            <div class="beat-meta" @click="playBeat(beat)">
              <h3 class="beat-title">{{ beat.title }}</h3>
              <div class="beat-sub">
                <span v-if="beat.genre" class="tag">{{ beat.genre }}</span>
                <span v-if="beat.bpm" class="subtle">{{ beat.bpm }} BPM</span>
                <span v-if="beat.key" class="subtle">· 调 {{ beat.key }}</span>
                <span v-if="beat.is_free" class="tag free-tag">免费</span>
              </div>
              <div v-if="playingBeatId === beat.id" class="progress-row">
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: progressPercent() + '%' }"></div>
                </div>
                <span class="progress-time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
              </div>
            </div>

            <div class="beat-right">
              <div class="data-row">
                <span class="data-pill" title="收藏数">
                  🤍 {{ beat.favorite_count ?? 0 }}
                </span>
                <span class="data-pill" title="下载数">
                  ⬇ {{ beat.download_count ?? 0 }}
                </span>
              </div>
              <div class="beat-actions">
                <button
                  class="icon-btn"
                  :class="{ liked: beat.is_favorited, busy: busyingFavId === beat.id }"
                  :disabled="busyingFavId === beat.id"
                  @click.stop="toggleFavorite(beat)"
                  :title="beat.is_favorited ? '取消收藏' : '收藏 / 点赞'"
                >
                  {{ beat.is_favorited ? '❤️' : '🤍' }}
                </button>
                <button
                  v-if="!profile.is_self"
                  class="icon-btn"
                  title="与 Beatmaker 私信"
                  @click.stop="sendDirectMessage"
                >
                  💬
                </button>
                <button
                  v-if="playingBeatId !== beat.id"
                  class="mini-play"
                  @click.stop="playBeat(beat)"
                  title="试听"
                >▶</button>
                <button
                  v-else
                  class="mini-play stop"
                  @click.stop="stopPlayback"
                  title="停止"
                >■</button>
              </div>
            </div>
          </li>
        </ul>

        <div v-if="hasMoreBeats" class="load-more-wrap">
          <button class="btn-outline" :disabled="beatsLoading" @click="loadMoreBeats">
            {{ beatsLoading ? '加载中…' : '加载更多作品' }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.profile-page {
  width: 78%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 16px 80px;
  box-sizing: border-box;
}

.state {
  text-align: center;
  padding: 80px 16px;
  color: var(--text-secondary, #6b7280);
}
.state.error { color: var(--error); }

/* ─── Hero ─────────────────────────────────────────────── */
.hero-card {
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--bg-card, #252540);
  box-shadow: 0 8px 32px var(--shadow);
  margin-bottom: 28px;
}
.hero-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(1000px 300px at 10% -20%, rgba(139, 92, 246, 0.25), transparent 60%),
              radial-gradient(800px 400px at 110% 120%, rgba(39, 210, 191, 0.20), transparent 60%);
  pointer-events: none;
}
.hero-inner {
  position: relative;
  padding: 28px 32px;
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 24px;
  align-items: stretch;
}
.hero-left {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  min-width: 0;
}
.avatar-wrap {
  position: relative;
  width: 108px;
  height: 108px;
  flex-shrink: 0;
}
.avatar-wrap img,
.avatar-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid var(--bg-card);
  box-shadow: 0 6px 20px var(--shadow);
}
.avatar-placeholder {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 42px;
  font-weight: 700;
}
.avatar-wrap :deep(.beatmaker-badge) {
  position: absolute;
  bottom: 0;
  right: 0;
}
.hero-info { min-width: 0; flex: 1; }
.hero-name-row {
  display: flex; align-items: center; gap: 10px; margin: 4px 0 2px;
}
.hero-name-row h1 {
  margin: 0; font-size: 26px; font-weight: 700;
}
.hero-username {
  margin: 0 0 6px; color: var(--text-secondary, #9ca3af); font-size: 14px;
}
.hero-cert {
  margin: 0 0 10px; color: var(--text-secondary, #9ca3af); font-size: 12px;
}
.hero-bio {
  margin: 0 0 12px;
  line-height: 1.7;
  color: var(--text-primary, #fff);
  font-size: 14px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hero-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.link-btn {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  background: var(--accent-light);
  color: var(--accent-hover);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.15s;
}
.link-btn:hover {
  filter: brightness(1.08);
  text-decoration: none;
}

.hero-right {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.stat {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 6px;
  text-align: center;
}
.stat-value {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
}
.stat-label {
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
  margin-top: 2px;
  display: block;
}
.action-row {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.btn-primary, .btn-outline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: #fff;
  box-shadow: 0 4px 12px var(--shadow);
}
.btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
.btn-primary.active {
  background: var(--accent-light);
  color: var(--accent-hover);
  box-shadow: none;
}
.btn-outline {
  background: transparent;
  color: var(--text-primary, #fff);
  border: 1px solid var(--border);
}
.btn-outline:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-hover);
  background: var(--accent-light);
}

/* ─── Beats ────────────────────────────────────────────── */
.beats-section {
  background: var(--bg-card, #252540);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 24px 28px;
  box-shadow: 0 4px 20px var(--shadow);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.section-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.count-pill {
  padding: 4px 12px;
  background: var(--accent-light);
  color: var(--accent-hover);
  border-radius: 100px;
  font-size: 12px;
  font-weight: 600;
}
.empty {
  text-align: center;
  padding: 60px 0;
  color: var(--text-secondary, #9ca3af);
}
.empty-emoji { font-size: 40px; margin-bottom: 10px; }
.empty p { margin: 0; }

.beat-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.beat-row {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.15s;
  cursor: pointer;
}
.beat-row:hover {
  border-color: var(--accent);
  background: var(--accent-light);
  transform: translateY(-1px);
}
.beat-cover {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
}
.beat-cover img, .cover-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
}
.cover-placeholder {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(39, 210, 191, 0.3));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}
.play-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
  color: #fff;
}
.beat-row:hover .play-mask { opacity: 1; }
.play-triangle {
  font-size: 20px;
  transform: translateX(2px);
}
.playing-icon {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 18px;
}
.playing-icon span {
  display: block;
  width: 3px;
  background: #fff;
  border-radius: 2px;
  animation: bar 0.9s ease-in-out infinite;
}
.playing-icon span:nth-child(2) { animation-delay: 0.15s; }
.playing-icon span:nth-child(3) { animation-delay: 0.3s; }
@keyframes bar {
  0%, 100% { height: 30%; }
  50% { height: 100%; }
}

.beat-meta { min-width: 0; }
.beat-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.beat-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary, #9ca3af);
  margin-bottom: 8px;
}
.tag {
  padding: 2px 8px;
  background: var(--accent-light);
  color: var(--accent-hover);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}
.tag.free-tag {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}
.subtle { color: var(--text-secondary, #9ca3af); }

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 360px;
}
.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  border-radius: 4px;
  transition: width 0.1s linear;
}
.progress-time {
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.beat-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.data-row {
  display: flex;
  gap: 8px;
}
.data-pill {
  padding: 3px 9px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
  font-weight: 500;
}
.beat-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  cursor: pointer;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.icon-btn:hover { background: var(--accent-light); border-color: var(--accent); }
.icon-btn.liked {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.4);
}
.icon-btn.busy { opacity: 0.5; cursor: not-allowed; }

.mini-play {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 10px var(--shadow);
  transition: all 0.15s;
}
.mini-play:hover { transform: translateY(-1px); }
.mini-play.stop {
  background: rgba(239, 68, 68, 0.8);
}

.load-more-wrap {
  margin-top: 20px;
  text-align: center;
}

/* 响应式 */
@media (max-width: 960px) {
  .profile-page { width: 100%; padding: 20px 12px; }
  .hero-inner { grid-template-columns: 1fr; }
  .stats-grid { grid-template-columns: repeat(5, 1fr); }
  .action-row { justify-content: flex-start; }
}
@media (max-width: 520px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .beat-row { grid-template-columns: 56px 1fr; }
  .beat-right { grid-column: 1 / -1; flex-direction: row; justify-content: space-between; }
  .beat-cover { width: 56px; height: 56px; }
}
</style>
