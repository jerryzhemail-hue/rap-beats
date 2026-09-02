<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import BeatCard from '@/components/BeatCard.vue'
import { fetchMyUploads, fetchMyDownloads, updateProfile, updatePassword, uploadAvatar, removeAvatar, updateMyBeat, deleteMyBeat, uploadMyBeatCover } from '@/api/user'
import { fetchFavorites } from '@/api/favorites'
import {
  fetchMyForumPosts,
  fetchMyForumFavorites,
  fetchMyForumLikes,
  fetchMyForumComments,
  deleteForumPost,
  fetchSignInStatus,
  type ForumPost,
  type ForumMyComment,
} from '@/api/forum'
import {
  defaultGenreCategoryValue,
  defaultGenreValue,
  genreCategoryOptions,
  getGenreCategoryValueByGenre,
  getGenreChildrenByCategory,
  normalizeGenreValue
} from '@/constants/genres'
import type { Beat } from '@/types'
import { resolveAvatarUrl, resolveCoverUrl } from '@/utils/assets'
import { submitFeedback, fetchMyFeedback } from '@/api/feedback'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const BPM_MIN = 40
const BPM_MAX = 240

type TabKey = 'uploads' | 'downloads' | 'favorites' | 'forum' | 'settings' | 'feedback'
type ForumSubKey = 'myposts' | 'mylikes' | 'myfavorites' | 'mycomments' | 'myaudio' | 'myimages'

const activeTab = ref<TabKey>('downloads')
const activeForumSub = ref<ForumSubKey>('myposts')

watch(() => authStore.isAdmin, (isAdmin) => {
  if (!isAdmin && activeTab.value === 'uploads') {
    activeTab.value = 'downloads'
  }
})

// uploads
const uploads = ref<Beat[]>([])
const uploadsTotal = ref(0)
const uploadsPage = ref(1)
const uploadsTotalPages = ref(1)
const uploadsLoading = ref(false)
const uploadActionSuccess = ref('')
const uploadActionError = ref('')
const uploadEditVisible = ref(false)
const uploadEditLoading = ref(false)
const uploadEditGenreCategory = ref(defaultGenreCategoryValue)
const uploadEditCoverFile = ref<File | null>(null)
const uploadEditCoverPreview = ref('')
const uploadEditForm = ref({
  id: 0,
  title: '',
  producer: '',
  bpm: undefined as number | undefined,
  genre: defaultGenreValue,
  tags: '',
  is_free: false
})

// downloads
const downloads = ref<any[]>([])
const downloadsTotal = ref(0)
const downloadsPage = ref(1)
const downloadsTotalPages = ref(1)
const downloadsLoading = ref(false)

// favorites
const favorites = ref<Beat[]>([])
const favoritesTotal = ref(0)
const favoritesPage = ref(1)
const favoritesTotalPages = ref(1)
const favoritesLoading = ref(false)

// forum
const forumMyPosts = ref<ForumPost[]>([])
const forumMyPostsTotal = ref(0)
const forumMyPostsPage = ref(1)
const forumMyPostsTotalPages = ref(1)
const forumMyPostsLoading = ref(false)

const forumMyLikes = ref<ForumPost[]>([])
const forumMyLikesTotal = ref(0)
const forumMyLikesPage = ref(1)
const forumMyLikesTotalPages = ref(1)
const forumMyLikesLoading = ref(false)

const forumMyFavorites = ref<ForumPost[]>([])
const forumMyFavoritesTotal = ref(0)
const forumMyFavoritesPage = ref(1)
const forumMyFavoritesTotalPages = ref(1)
const forumMyFavoritesLoading = ref(false)

const forumMyComments = ref<ForumMyComment[]>([])
const forumMyCommentsTotal = ref(0)
const forumMyCommentsPage = ref(1)
const forumMyCommentsTotalPages = ref(1)
const forumMyCommentsLoading = ref(false)

const forumMyAudio = ref<ForumPost[]>([])
const forumMyAudioTotal = ref(0)
const forumMyAudioPage = ref(1)
const forumMyAudioTotalPages = ref(1)
const forumMyAudioLoading = ref(false)

const forumMyImages = ref<{ post_id: number; title: string; image: string; created_at: string }[]>([])
const forumMyImagesTotal = ref(0)
const forumMyImagesPage = ref(1)
const forumMyImagesTotalPages = ref(1)
const forumMyImagesLoading = ref(false)

const forumDeleteMsg = ref('')

// settings
const profileUsername = ref('')
const profileEmail = ref('')
const profileSuccess = ref('')
const profileError = ref('')
const profileLoading = ref(false)
const avatarFile = ref<File | null>(null)
const avatarPreviewUrl = ref('')
const avatarSuccess = ref('')
const avatarError = ref('')
const avatarLoading = ref(false)

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordSuccess = ref('')
const passwordError = ref('')
const passwordLoading = ref(false)

// feedback
const myFeedback = ref<any[]>([])
const myFeedbackTotal = ref(0)
const myFeedbackPage = ref(1)
const myFeedbackTotalPages = ref(1)
const myFeedbackLoading = ref(false)
const feedbackForm = ref({ type: 'bug', title: '', content: '', contact: '' })
const feedbackSubmitError = ref('')
const feedbackSubmitSuccess = ref('')
const feedbackLoading = ref(false)

const user = computed(() => authStore.user)

const avatarLetter = computed(() => {
  return (user.value?.username || '?')[0].toUpperCase()
})

const avatarSrc = computed(() => {
  if (avatarPreviewUrl.value) return avatarPreviewUrl.value
  if (user.value?.avatar_url) return resolveAvatarUrl(user.value.avatar_url)
  return ''
})

const uploadGenreChildOptions = computed(() => getGenreChildrenByCategory(uploadEditGenreCategory.value))

const profileTabs = computed(() => {
  const tabs = [
    { key: 'downloads', label: '下载记录' },
    { key: 'favorites', label: '我的收藏' },
    { key: 'forum', label: '我的论坛' },
    { key: 'feedback', label: '意见反馈' },
    { key: 'settings', label: '个人设置' },
  ]
  if (authStore.isAdmin) {
    tabs.splice(0, 0, { key: 'uploads', label: '我的上传' })
  }
  return tabs
})

const forumSubTabs = [
  { key: 'myposts', label: '发布的帖子' },
  { key: 'mylikes', label: '点赞' },
  { key: 'myfavorites', label: '收藏' },
  { key: 'mycomments', label: '评论' },
  { key: 'myaudio', label: '音频记录' },
  { key: 'myimages', label: '图片记录' },
] as const

function isValidBpmValue(value: number | undefined) {
  return value !== undefined && Number.isInteger(Number(value)) && Number(value) >= BPM_MIN && Number(value) <= BPM_MAX
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeTags(tags: Beat['tags'] | string | null | undefined) {
  if (Array.isArray(tags)) return tags.join(', ')
  if (typeof tags !== 'string') return ''

  const value = tags.trim()
  if (!value) return ''

  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.join(', ')
    } catch {
      return value
    }
  }

  return value
}

function clearAvatarPreview() {
  if (avatarPreviewUrl.value) {
    URL.revokeObjectURL(avatarPreviewUrl.value)
    avatarPreviewUrl.value = ''
  }
}

function clearUploadEditCoverPreview() {
  if (uploadEditCoverPreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(uploadEditCoverPreview.value)
  }
  uploadEditCoverPreview.value = ''
}

function setUploadEditCoverPreview(value: string) {
  clearUploadEditCoverPreview()
  uploadEditCoverPreview.value = value
}

async function loadMyFeedback() {
  myFeedbackLoading.value = true
  try {
    const data = await fetchMyFeedback(myFeedbackPage.value)
    myFeedback.value = data.feedback
    myFeedbackTotal.value = data.total
    myFeedbackTotalPages.value = data.totalPages
  } catch (e) {
    console.error(e)
  } finally {
    myFeedbackLoading.value = false
  }
}

async function handleSubmitFeedback() {
  feedbackSubmitError.value = ''
  feedbackSubmitSuccess.value = ''
  const { type, title, content, contact } = feedbackForm.value
  if (!title.trim()) { feedbackSubmitError.value = '请填写标题'; return }
  if (content.trim().length < 10) { feedbackSubmitError.value = '详细描述至少10字'; return }
  feedbackLoading.value = true
  try {
    await submitFeedback({ type, title: title.trim(), content, contact })
    feedbackSubmitSuccess.value = '反馈已提交，感谢你的意见！'
    feedbackForm.value = { type: 'bug', title: '', content: '', contact: '' }
    myFeedbackPage.value = 1
    await loadMyFeedback()
  } catch (e: any) {
    feedbackSubmitError.value = e?.error || '提交失败，请重试'
  } finally {
    feedbackLoading.value = false
  }
}

function handleUploadEditCoverSelect(file: File) {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp']
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!allowed.includes(ext)) {
    uploadActionError.value = '封面仅支持 jpg、png、webp 格式'
    return
  }

  uploadEditCoverFile.value = file
  uploadActionError.value = ''
  setUploadEditCoverPreview(URL.createObjectURL(file))
}

function onUploadEditCoverChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) handleUploadEditCoverSelect(file)
}

async function loadUploads() {
  uploadsLoading.value = true
  try {
    const data: any = await fetchMyUploads(uploadsPage.value)
    uploads.value = data.beats || []
    uploadsTotal.value = data.total || 0
    uploadsTotalPages.value = data.totalPages || 1
  } catch {
    uploads.value = []
  } finally {
    uploadsLoading.value = false
  }
}

function openUploadEdit(beat: Beat) {
  uploadActionSuccess.value = ''
  uploadActionError.value = ''
  const normalizedGenre = normalizeGenreValue(beat.genre)
  uploadEditGenreCategory.value = getGenreCategoryValueByGenre(normalizedGenre)
  uploadEditCoverFile.value = null
  setUploadEditCoverPreview(resolveCoverUrl(beat.cover_image))
  uploadEditForm.value = {
    id: beat.id,
    title: beat.title,
    producer: beat.producer,
    bpm: beat.bpm || undefined,
    genre: normalizedGenre,
    tags: normalizeTags(beat.tags as any),
    is_free: !!beat.is_free
  }
  uploadEditVisible.value = true
}

function closeUploadEdit() {
  uploadEditVisible.value = false
  uploadEditCoverFile.value = null
  clearUploadEditCoverPreview()
}

function onUploadEditGenreCategoryChange() {
  const firstChild = getGenreChildrenByCategory(uploadEditGenreCategory.value)[0]
  uploadEditForm.value.genre = firstChild?.value || defaultGenreValue
}

async function saveUploadEdit() {
  uploadActionSuccess.value = ''
  uploadActionError.value = ''

  if (!uploadEditForm.value.title.trim() || !uploadEditForm.value.producer.trim() || !uploadEditForm.value.genre.trim()) {
    uploadActionError.value = '请完整填写标题、制作人和风格'
    return
  }

  if (!isValidBpmValue(uploadEditForm.value.bpm)) {
    uploadActionError.value = `请填写 ${BPM_MIN}-${BPM_MAX} 之间的整数 BPM`
    return
  }

  uploadEditLoading.value = true
  try {
    let nextCoverImage: string | undefined
    if (uploadEditCoverFile.value) {
      const uploadedCover = await uploadMyBeatCover(uploadEditForm.value.id, uploadEditCoverFile.value)
      nextCoverImage = uploadedCover.stored_value
    }

    await updateMyBeat(uploadEditForm.value.id, {
      title: uploadEditForm.value.title.trim(),
      producer: uploadEditForm.value.producer.trim(),
      bpm: Number(uploadEditForm.value.bpm),
      genre: uploadEditForm.value.genre.trim(),
      tags: uploadEditForm.value.tags.trim(),
      cover_image: nextCoverImage,
      is_free: uploadEditForm.value.is_free ? 1 : 0
    })
    uploadActionSuccess.value = '伴奏信息已更新'
    uploadEditVisible.value = false
    await loadUploads()
  } catch (err: any) {
    uploadActionError.value = err.message || '保存失败，请稍后重试'
  } finally {
    uploadEditLoading.value = false
  }
}

async function removeUploadedBeat(beat: Beat) {
  uploadActionSuccess.value = ''
  uploadActionError.value = ''

  if (!window.confirm(`确定删除伴奏“${beat.title}”吗？删除后将无法恢复。`)) {
    return
  }

  try {
    await deleteMyBeat(beat.id)
    uploadActionSuccess.value = '伴奏已删除'

    if (uploads.value.length === 1 && uploadsPage.value > 1) {
      uploadsPage.value -= 1
    } else {
      await loadUploads()
    }
  } catch (err: any) {
    uploadActionError.value = err.message || '删除失败，请稍后重试'
  }
}

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

async function loadForumMyPosts() {
  forumMyPostsLoading.value = true
  try {
    const data = await fetchMyForumPosts({ page: forumMyPostsPage.value })
    forumMyPosts.value = data.posts
    forumMyPostsTotal.value = data.total
    forumMyPostsTotalPages.value = data.page_size > 0 ? Math.ceil(data.total / data.page_size) : 1
  } catch {
    forumMyPosts.value = []
  } finally {
    forumMyPostsLoading.value = false
  }
}

async function loadForumMyLikes() {
  forumMyLikesLoading.value = true
  try {
    const data = await fetchMyForumLikes({ page: forumMyLikesPage.value })
    forumMyLikes.value = data.posts
    forumMyLikesTotal.value = data.total
    forumMyLikesTotalPages.value = data.page_size > 0 ? Math.ceil(data.total / data.page_size) : 1
  } catch {
    forumMyLikes.value = []
  } finally {
    forumMyLikesLoading.value = false
  }
}

async function loadForumMyFavorites() {
  forumMyFavoritesLoading.value = true
  try {
    const data = await fetchMyForumFavorites({ page: forumMyFavoritesPage.value })
    forumMyFavorites.value = data.posts
    forumMyFavoritesTotal.value = data.total
    forumMyFavoritesTotalPages.value = data.page_size > 0 ? Math.ceil(data.total / data.page_size) : 1
  } catch {
    forumMyFavorites.value = []
  } finally {
    forumMyFavoritesLoading.value = false
  }
}

async function loadForumMyComments() {
  forumMyCommentsLoading.value = true
  try {
    const data = await fetchMyForumComments({ page: forumMyCommentsPage.value })
    forumMyComments.value = data.comments
    forumMyCommentsTotal.value = data.total
    forumMyCommentsTotalPages.value = data.page_size > 0 ? Math.ceil(data.total / data.page_size) : 1
  } catch {
    forumMyComments.value = []
  } finally {
    forumMyCommentsLoading.value = false
  }
}

async function loadForumMyAudio() {
  forumMyAudioLoading.value = true
  try {
    const data = await fetchMyForumPosts({ page: forumMyAudioPage.value })
    forumMyAudio.value = (data.posts || []).filter((p: ForumPost) => !!p.music_file || !!p.music_title)
    forumMyAudioTotal.value = data.total
    forumMyAudioTotalPages.value = data.page_size > 0 ? Math.ceil(data.total / data.page_size) : 1
  } catch {
    forumMyAudio.value = []
  } finally {
    forumMyAudioLoading.value = false
  }
}

async function loadForumMyImages() {
  forumMyImagesLoading.value = true
  try {
    const data = await fetchMyForumPosts({ page: forumMyImagesPage.value })
    const images: { post_id: number; title: string; image: string; created_at: string }[] = []
    for (const post of (data.posts || [])) {
      const postImages = Array.isArray(post.images) ? post.images : []
      for (const img of postImages.slice(0, 6)) {
        images.push({ post_id: post.id, title: post.title, image: img, created_at: post.created_at })
      }
    }
    forumMyImages.value = images
    forumMyImagesTotal.value = images.length
    forumMyImagesTotalPages.value = 1
  } catch {
    forumMyImages.value = []
  } finally {
    forumMyImagesLoading.value = false
  }
}

async function deleteForumPostById(postId: number) {
  if (!window.confirm('确定删除该帖子吗？')) return
  forumDeleteMsg.value = ''
  try {
    await deleteForumPost(postId)
    forumDeleteMsg.value = '帖子已删除'
    await loadForumMyPosts()
  } catch (err: any) {
    forumDeleteMsg.value = err.message || '删除失败'
  }
}

function switchTab(tab: TabKey) {
  activeTab.value = tab
}

watch(activeTab, (tab) => {
  if (tab === 'uploads' && authStore.isAdmin && uploads.value.length === 0) loadUploads()
  if (tab === 'downloads' && downloads.value.length === 0) loadDownloads()
  if (tab === 'favorites' && favorites.value.length === 0) loadFavorites()
  if (tab === 'forum' && forumMyPosts.value.length === 0) loadForumMyPosts()
  if (tab === 'feedback' && myFeedback.value.length === 0) loadMyFeedback()
  if (tab === 'settings') {
    profileUsername.value = user.value?.username || ''
    profileEmail.value = user.value?.email || ''
    avatarSuccess.value = ''
    avatarError.value = ''
  }
})

watch(activeForumSub, (sub) => {
  if (sub === 'myposts' && forumMyPosts.value.length === 0) loadForumMyPosts()
  if (sub === 'mylikes' && forumMyLikes.value.length === 0) loadForumMyLikes()
  if (sub === 'myfavorites' && forumMyFavorites.value.length === 0) loadForumMyFavorites()
  if (sub === 'mycomments' && forumMyComments.value.length === 0) loadForumMyComments()
  if (sub === 'myaudio' && forumMyAudio.value.length === 0) loadForumMyAudio()
  if (sub === 'myimages' && forumMyImages.value.length === 0) loadForumMyImages()
})

watch(forumMyPostsPage, loadForumMyPosts)
watch(forumMyLikesPage, loadForumMyLikes)
watch(forumMyFavoritesPage, loadForumMyFavorites)
watch(forumMyCommentsPage, loadForumMyComments)
watch(forumMyAudioPage, loadForumMyAudio)
watch(uploadsPage, loadUploads)
watch(downloadsPage, loadDownloads)
watch(favoritesPage, loadFavorites)

onMounted(() => {
  const tabParam = route.query.tab as string
  if (tabParam && ['uploads', 'downloads', 'favorites', 'forum', 'settings', 'feedback'].includes(tabParam)) {
    activeTab.value = tabParam as TabKey
  }
  if (authStore.isAdmin) loadUploads()
  loadSignInStatus()
  profileUsername.value = user.value?.username || ''
  profileEmail.value = user.value?.email || ''
})

onBeforeUnmount(() => {
  clearAvatarPreview()
  clearUploadEditCoverPreview()
})

async function saveProfile() {
  profileError.value = ''
  profileSuccess.value = ''
  if (!profileUsername.value.trim() || !profileEmail.value.trim()) {
    profileError.value = '用户名和邮箱不能为空'
    return
  }
  profileLoading.value = true
  try {
    const data: any = await updateProfile({ username: profileUsername.value.trim(), email: profileEmail.value.trim() })
    profileSuccess.value = data.message || '更新成功'
    if (data.user && authStore.user) {
      authStore.user.username = data.user.username
      authStore.user.email = data.user.email
    }
  } catch (err: any) {
    profileError.value = err.message || '更新失败'
  } finally {
    profileLoading.value = false
  }
}

function handleAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null

  avatarSuccess.value = ''
  avatarError.value = ''
  avatarFile.value = null
  clearAvatarPreview()

  if (!file) return

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    avatarError.value = '头像仅支持 JPG、PNG、WEBP 格式'
    input.value = ''
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    avatarError.value = '头像大小不能超过 5MB'
    input.value = ''
    return
  }

  avatarFile.value = file
  avatarPreviewUrl.value = URL.createObjectURL(file)
}

async function saveAvatar() {
  if (!avatarFile.value) {
    avatarError.value = '请先选择头像文件'
    return
  }

  avatarLoading.value = true
  avatarSuccess.value = ''
  avatarError.value = ''

  try {
    const data = await uploadAvatar(avatarFile.value)
    avatarSuccess.value = data.message || '头像上传成功'
    if (authStore.user) {
      authStore.user.avatar_url = data.user.avatar_url || null
    }
    avatarFile.value = null
    clearAvatarPreview()
    await authStore.checkAuth()
  } catch (err: any) {
    avatarError.value = err.message || '头像上传失败'
  } finally {
    avatarLoading.value = false
  }
}

async function resetAvatar() {
  avatarLoading.value = true
  avatarSuccess.value = ''
  avatarError.value = ''

  try {
    const data = await removeAvatar()
    if (authStore.user) {
      authStore.user.avatar_url = data.user.avatar_url || null
    }
    avatarFile.value = null
    clearAvatarPreview()
    avatarSuccess.value = data.message || '已恢复默认头像'
    await authStore.checkAuth()
  } catch (err: any) {
    avatarError.value = err.message || '恢复默认头像失败'
  } finally {
    avatarLoading.value = false
  }
}

async function savePassword() {
  passwordError.value = ''
  passwordSuccess.value = ''
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) {
    passwordError.value = '请填写所有密码字段'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = '两次新密码不一致'
    return
  }
  if (newPassword.value.length < 6) {
    passwordError.value = '新密码至少6位'
    return
  }
  passwordLoading.value = true
  try {
    const data: any = await updatePassword({ oldPassword: oldPassword.value, newPassword: newPassword.value })
    passwordSuccess.value = data.message || '密码修改成功'
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (err: any) {
    passwordError.value = err.message || '修改失败'
  } finally {
    passwordLoading.value = false
  }
}

// 积分
const signInStatus = ref({ signed_today: false, consecutive_days: 0, total_points: 0 })
async function loadSignInStatus() {
  if (!authStore.isAuthenticated) return
  try {
    signInStatus.value = await fetchSignInStatus()
  } catch {}
}

const defaultCover = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#252540" width="200" height="200"/><text fill="#7c3aed" font-size="60" x="50%" y="55%" text-anchor="middle" dominant-baseline="middle">&#9835;</text></svg>')
</script>

<template>
  <div class="profile-page container">
    <!-- 用户信息区 -->
    <div class="profile-hero">
      <div class="avatar-circle">
        <img v-if="avatarSrc" :src="avatarSrc" :alt="`${user?.username || '用户'}头像`" class="avatar-image" />
        <span v-else>{{ avatarLetter }}</span>
      </div>
      <div class="profile-info">
        <h1 class="profile-name">{{ user?.username }}</h1>
        <p class="profile-email">{{ user?.email }}</p>
        <div class="profile-meta">
          <span class="role-badge" :class="user?.role === 'admin' ? 'role-admin' : 'role-user'">
            {{ user?.role === 'admin' ? 'Admin' : 'User' }}
          </span>
          <span v-if="authStore.isVip" class="role-badge" :style="{ background: authStore.vipLevel === 'basic' ? '#cd7f3233' : authStore.vipLevel === 'premium' ? '#c0c0c033' : '#f59e0b33', color: authStore.vipLevel === 'basic' ? '#cd7f32' : authStore.vipLevel === 'premium' ? '#c0c0c0' : '#f59e0b', borderColor: authStore.vipLevel === 'basic' ? '#cd7f3255' : authStore.vipLevel === 'premium' ? '#c0c0c055' : '#f59e0b55' }">
            {{ authStore.vipLevel === 'basic' ? '基础会员' : authStore.vipLevel === 'premium' ? '高级会员' : '至尊会员' }}
          </span>
          <span class="points-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
            {{ signInStatus.total_points }} 积分
          </span>
          <span class="join-date">注册于 {{ formatDate((user as any)?.created_at || '') }}</span>
        </div>
      </div>
    </div>

    <!-- Tab 切换栏 -->
    <div class="tab-bar">
      <button
        v-for="tab in profileTabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="switchTab(tab.key as TabKey)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 我的上传 -->
    <div v-if="activeTab === 'uploads'" class="tab-content">
      <div v-if="uploadActionSuccess" class="success-msg uploads-msg">{{ uploadActionSuccess }}</div>
      <div v-if="uploadActionError" class="error-msg uploads-msg">{{ uploadActionError }}</div>
      <div v-if="uploadsLoading" class="loading-state">加载中...</div>
      <div v-else-if="uploads.length === 0" class="empty-state">
        <span class="empty-icon">&#9835;</span>
        <p>还没有上传伴奏</p>
      </div>
      <div v-else>
        <div class="beats-grid uploads-manage-grid">
          <div v-for="beat in uploads" :key="beat.id" class="upload-manage-item">
            <BeatCard :beat="beat" />
            <div class="upload-manage-actions">
              <button type="button" class="manage-btn" @click="openUploadEdit(beat)">编辑信息</button>
              <button type="button" class="manage-btn manage-btn-danger" @click="removeUploadedBeat(beat)">删除伴奏</button>
            </div>
          </div>
        </div>
        <div v-if="uploadsTotalPages > 1" class="pagination">
          <button class="page-btn" :disabled="uploadsPage <= 1" @click="uploadsPage--">上一页</button>
          <span class="page-info">{{ uploadsPage }} / {{ uploadsTotalPages }}</span>
          <button class="page-btn" :disabled="uploadsPage >= uploadsTotalPages" @click="uploadsPage++">下一页</button>
        </div>
      </div>
    </div>

    <!-- 下载记录 -->
    <div v-if="activeTab === 'downloads'" class="tab-content">
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

    <!-- 我的收藏 -->
    <div v-if="activeTab === 'favorites'" class="tab-content">
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

    <!-- 我的论坛 -->
    <div v-if="activeTab === 'forum'" class="tab-content">
      <div class="forum-layout">
        <!-- 子 Tab 栏（纵向） -->
        <div class="forum-sub-tabs">
          <button
            v-for="sub in forumSubTabs"
            :key="sub.key"
            class="forum-sub-tab"
            :class="{ active: activeForumSub === sub.key }"
            @click="activeForumSub = sub.key as ForumSubKey"
          >
            {{ sub.label }}
          </button>
        </div>

        <!-- 内容区 -->
        <div class="forum-sub-content">
          <div v-if="forumDeleteMsg" class="success-msg forum-action-msg" :class="{ 'error-msg': forumDeleteMsg.includes('失败') }">
            {{ forumDeleteMsg }}
          </div>

          <!-- 发布的帖子 -->
          <div v-if="activeForumSub === 'myposts'">
        <div v-if="forumMyPostsLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyPosts.length === 0" class="empty-state">
          <span class="empty-icon">&#128221;</span>
          <p>还没有发布过帖子</p>
          <button class="btn btn-primary" @click="router.push('/forum/new')">发布帖子</button>
        </div>
        <div v-else>
          <div class="forum-post-list">
            <div v-for="post in forumMyPosts" :key="post.id" class="forum-post-item" @click="router.push(`/forum/post/${post.id}`)">
              <div class="forum-post-left">
                <span v-if="post.is_pinned" class="pin-badge">置顶</span>
                <span v-if="post.is_essence" class="essence-badge">精</span>
                <h3 class="forum-post-title">{{ post.title }}</h3>
                <p class="forum-post-preview">{{ post.content_preview }}</p>
                <div class="forum-post-meta">
                  <span class="forum-post-cat">{{ post.category_name }}</span>
                  <span class="forum-post-stat">&#10084; {{ post.like_count }}</span>
                  <span class="forum-post-stat">&#128172; {{ post.comment_count }}</span>
                  <span class="forum-post-stat">&#128065; {{ post.view_count }}</span>
                  <span class="forum-post-time">{{ post.time_ago }}</span>
                </div>
              </div>
              <div v-if="post.cover_image" class="forum-post-thumb">
                <img :src="resolveCoverUrl(post.cover_image)" :alt="post.title" />
              </div>
              <button
                class="forum-post-delete"
                title="删除帖子"
                @click.stop="deleteForumPostById(post.id)"
              >&#10005;</button>
            </div>
          </div>
          <div v-if="forumMyPostsTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="forumMyPostsPage <= 1" @click="forumMyPostsPage--">上一页</button>
            <span class="page-info">{{ forumMyPostsPage }} / {{ forumMyPostsTotalPages }}</span>
            <button class="page-btn" :disabled="forumMyPostsPage >= forumMyPostsTotalPages" @click="forumMyPostsPage++">下一页</button>
          </div>
        </div>
      </div>

      <!-- 点赞 -->
      <div class="forum-sub-content" v-if="activeForumSub === 'mylikes'">
        <div v-if="forumMyLikesLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyLikes.length === 0" class="empty-state">
          <span class="empty-icon">&#10084;</span>
          <p>还没有点赞过帖子</p>
        </div>
        <div v-else>
          <div class="forum-post-list">
            <div v-for="post in forumMyLikes" :key="post.id" class="forum-post-item" @click="router.push(`/forum/post/${post.id}`)">
              <div class="forum-post-left">
                <span v-if="post.is_pinned" class="pin-badge">置顶</span>
                <span v-if="post.is_essence" class="essence-badge">精</span>
                <h3 class="forum-post-title">{{ post.title }}</h3>
                <p class="forum-post-preview">{{ post.content_preview }}</p>
                <div class="forum-post-meta">
                  <span class="forum-post-cat">{{ post.category_name }}</span>
                  <span class="forum-post-author">&#64;{{ post.author_username }}</span>
                  <span class="forum-post-time">{{ post.time_ago }}</span>
                </div>
              </div>
              <div v-if="post.cover_image" class="forum-post-thumb">
                <img :src="resolveCoverUrl(post.cover_image)" :alt="post.title" />
              </div>
            </div>
          </div>
          <div v-if="forumMyLikesTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="forumMyLikesPage <= 1" @click="forumMyLikesPage--">上一页</button>
            <span class="page-info">{{ forumMyLikesPage }} / {{ forumMyLikesTotalPages }}</span>
            <button class="page-btn" :disabled="forumMyLikesPage >= forumMyLikesTotalPages" @click="forumMyLikesPage++">下一页</button>
          </div>
        </div>
      </div>

      <!-- 收藏 -->
      <div class="forum-sub-content" v-if="activeForumSub === 'myfavorites'">
        <div v-if="forumMyFavoritesLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyFavorites.length === 0" class="empty-state">
          <span class="empty-icon">&#9733;</span>
          <p>还没有收藏帖子</p>
        </div>
        <div v-else>
          <div class="forum-post-list">
            <div v-for="post in forumMyFavorites" :key="post.id" class="forum-post-item" @click="router.push(`/forum/post/${post.id}`)">
              <div class="forum-post-left">
                <span v-if="post.is_pinned" class="pin-badge">置顶</span>
                <span v-if="post.is_essence" class="essence-badge">精</span>
                <h3 class="forum-post-title">{{ post.title }}</h3>
                <p class="forum-post-preview">{{ post.content_preview }}</p>
                <div class="forum-post-meta">
                  <span class="forum-post-cat">{{ post.category_name }}</span>
                  <span class="forum-post-author">&#64;{{ post.author_username }}</span>
                  <span class="forum-post-stat">&#10084; {{ post.like_count }}</span>
                  <span class="forum-post-stat">&#128172; {{ post.comment_count }}</span>
                  <span class="forum-post-time">{{ post.time_ago }}</span>
                </div>
              </div>
              <div v-if="post.cover_image" class="forum-post-thumb">
                <img :src="resolveCoverUrl(post.cover_image)" :alt="post.title" />
              </div>
            </div>
          </div>
          <div v-if="forumMyFavoritesTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="forumMyFavoritesPage <= 1" @click="forumMyFavoritesPage--">上一页</button>
            <span class="page-info">{{ forumMyFavoritesPage }} / {{ forumMyFavoritesTotalPages }}</span>
            <button class="page-btn" :disabled="forumMyFavoritesPage >= forumMyFavoritesTotalPages" @click="forumMyFavoritesPage++">下一页</button>
          </div>
        </div>
      </div>

      <!-- 评论 -->
      <div class="forum-sub-content" v-if="activeForumSub === 'mycomments'">
        <div v-if="forumMyCommentsLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyComments.length === 0" class="empty-state">
          <span class="empty-icon">&#128172;</span>
          <p>还没有评论过帖子</p>
        </div>
        <div v-else>
          <div class="forum-comment-list">
            <div v-for="comment in forumMyComments" :key="comment.id" class="forum-comment-item" @click="router.push(`/forum/post/${comment.post_id}`)">
              <div class="forum-comment-post-title">
                回复了帖子：{{ comment.post_title }}
              </div>
              <p class="forum-comment-content">{{ comment.content }}</p>
              <div class="forum-post-meta">
                <span class="forum-post-stat">&#10084; {{ comment.like_count }}</span>
                <span class="forum-post-time">{{ comment.time_ago }}</span>
              </div>
            </div>
          </div>
          <div v-if="forumMyCommentsTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="forumMyCommentsPage <= 1" @click="forumMyCommentsPage--">上一页</button>
            <span class="page-info">{{ forumMyCommentsPage }} / {{ forumMyCommentsTotalPages }}</span>
            <button class="page-btn" :disabled="forumMyCommentsPage >= forumMyCommentsTotalPages" @click="forumMyCommentsPage++">下一页</button>
          </div>
        </div>
      </div>

      <!-- 音频记录 -->
      <div class="forum-sub-content" v-if="activeForumSub === 'myaudio'">
        <div v-if="forumMyAudioLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyAudio.length === 0" class="empty-state">
          <span class="empty-icon">&#127925;</span>
          <p>还没有发布过音频</p>
          <button class="btn btn-primary" @click="router.push('/forum/new')">发布音频</button>
        </div>
        <div v-else>
          <div class="beats-grid">
            <div v-for="post in forumMyAudio" :key="post.id" class="audio-record-item">
              <div class="audio-record-cover" @click="router.push(`/forum/post/${post.id}`)">
                <img v-if="post.music_cover_image || post.cover_image" :src="resolveCoverUrl(post.music_cover_image || post.cover_image)" :alt="post.music_title || post.title" />
                <div v-else class="audio-record-placeholder">&#127925;</div>
                <div class="audio-play-overlay">&#9658;</div>
              </div>
              <div class="audio-record-info">
                <p class="audio-record-title">{{ post.music_title || post.title }}</p>
                <p v-if="post.music_artist" class="audio-record-artist">{{ post.music_artist }}</p>
                <div class="audio-record-meta">
                  <span v-if="post.music_bpm">{{ post.music_bpm }} BPM</span>
                  <span v-if="post.music_genre">{{ post.music_genre }}</span>
                  <span class="forum-post-time">{{ post.time_ago }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="forumMyAudioTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="forumMyAudioPage <= 1" @click="forumMyAudioPage--">上一页</button>
            <span class="page-info">{{ forumMyAudioPage }} / {{ forumMyAudioTotalPages }}</span>
            <button class="page-btn" :disabled="forumMyAudioPage >= forumMyAudioTotalPages" @click="forumMyAudioPage++">下一页</button>
          </div>
        </div>
      </div>

      <!-- 图片记录 -->
      <div class="forum-sub-content" v-if="activeForumSub === 'myimages'">
        <div v-if="forumMyImagesLoading" class="loading-state">加载中...</div>
        <div v-else-if="forumMyImages.length === 0" class="empty-state">
          <span class="empty-icon">&#128247;</span>
          <p>还没有发布过图片</p>
          <button class="btn btn-primary" @click="router.push('/forum/new')">发布图片</button>
        </div>
        <div v-else>
          <div class="forum-images-grid">
            <div v-for="(img, idx) in forumMyImages" :key="idx" class="forum-image-item">
              <img :src="img.image" :alt="img.title" @click="router.push(`/forum/post/${img.post_id}`)" />
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>

    <!-- 个人设置 -->
    <div v-if="activeTab === 'settings'" class="tab-content">
      <div class="settings-section">
        <h2 class="settings-title">自定义头像</h2>
        <div class="avatar-settings">
          <div class="avatar-circle avatar-circle-large">
            <img v-if="avatarSrc" :src="avatarSrc" :alt="`${user?.username || '用户'}头像`" class="avatar-image" />
            <span v-else>{{ avatarLetter }}</span>
          </div>
          <div class="avatar-actions">
            <div v-if="avatarSuccess" class="success-msg">{{ avatarSuccess }}</div>
            <div v-if="avatarError" class="error-msg">{{ avatarError }}</div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="avatar-input"
              @change="handleAvatarChange"
            />
            <p class="avatar-hint">支持 JPG、PNG、WEBP，大小不超过 5MB</p>
            <div class="avatar-button-group">
              <button type="button" class="btn btn-primary save-btn" :disabled="avatarLoading" @click="saveAvatar">
                <span v-if="avatarLoading" class="spinner"></span>
                <span v-else>上传头像</span>
              </button>
              <button
                v-if="user?.avatar_url || avatarPreviewUrl"
                type="button"
                class="btn avatar-reset-btn"
                :disabled="avatarLoading"
                @click="resetAvatar"
              >
                恢复默认头像
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2 class="settings-title">修改个人信息</h2>
        <div v-if="profileSuccess" class="success-msg">{{ profileSuccess }}</div>
        <div v-if="profileError" class="error-msg">{{ profileError }}</div>
        <form class="settings-form" @submit.prevent="saveProfile">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input v-model="profileUsername" type="text" class="form-input" placeholder="3-20个字符" />
          </div>
          <div class="form-group">
            <label class="form-label">邮箱</label>
            <input v-model="profileEmail" type="email" class="form-input" placeholder="输入邮箱" />
          </div>
          <button type="submit" class="btn btn-primary save-btn" :disabled="profileLoading">
            <span v-if="profileLoading" class="spinner"></span>
            <span v-else>保存修改</span>
          </button>
        </form>
      </div>

      <div class="settings-section">
        <h2 class="settings-title">修改密码</h2>
        <div v-if="passwordSuccess" class="success-msg">{{ passwordSuccess }}</div>
        <div v-if="passwordError" class="error-msg">{{ passwordError }}</div>
        <form class="settings-form" @submit.prevent="savePassword">
          <div class="form-group">
            <label class="form-label">旧密码</label>
            <input v-model="oldPassword" type="password" class="form-input" placeholder="输入当前密码" autocomplete="current-password" />
          </div>
          <div class="form-group">
            <label class="form-label">新密码</label>
            <input v-model="newPassword" type="password" class="form-input" placeholder="至少6位" autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label class="form-label">确认新密码</label>
            <input v-model="confirmPassword" type="password" class="form-input" placeholder="再次输入新密码" autocomplete="new-password" />
          </div>
          <button type="submit" class="btn btn-primary save-btn" :disabled="passwordLoading">
            <span v-if="passwordLoading" class="spinner"></span>
            <span v-else>修改密码</span>
          </button>
        </form>
      </div>
    </div>

    <!-- 意见反馈 -->
    <div v-if="activeTab === 'feedback'" class="tab-content">
      <div class="feedback-section">
        <h2 class="section-title">提交意见反馈</h2>
        <form class="feedback-form" @submit.prevent="handleSubmitFeedback">
          <div class="form-group">
            <label class="form-label">反馈类型 <span class="required">*</span></label>
            <select v-model="feedbackForm.type" class="form-select">
              <option value="bug">🐛 Bug 问题</option>
              <option value="suggestion">💡 功能建议</option>
              <option value="other">📝 其他</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">标题 <span class="required">*</span></label>
            <input v-model="feedbackForm.title" type="text" class="form-input" placeholder="简要描述问题或建议（最多50字）" maxlength="50" />
          </div>
          <div class="form-group">
            <label class="form-label">详细描述 <span class="required">*</span></label>
            <textarea v-model="feedbackForm.content" class="form-textarea" placeholder="请详细描述你遇到的问题或你的建议（至少10字，最多1000字）" rows="6" maxlength="1000"></textarea>
            <div class="char-count">{{ feedbackForm.content.length }} / 1000</div>
          </div>
          <div class="form-group">
            <label class="form-label">联系方式（选填）</label>
            <input v-model="feedbackForm.contact" type="text" class="form-input" placeholder="微信 / 邮箱，方便我们联系你（选填）" maxlength="100" />
          </div>
          <div v-if="feedbackSubmitError" class="error-message">{{ feedbackSubmitError }}</div>
          <div v-if="feedbackSubmitSuccess" class="success-message">{{ feedbackSubmitSuccess }}</div>
          <button type="submit" class="btn btn-primary" :disabled="feedbackLoading">
            <span v-if="feedbackLoading" class="spinner"></span>
            <span v-else>提交反馈</span>
          </button>
        </form>

        <div class="my-feedback-list">
          <h3 class="section-title" style="margin-top: 40px;">我的反馈记录</h3>
          <div v-if="myFeedbackLoading" class="loading-state">加载中...</div>
          <div v-else-if="myFeedback.length === 0" class="empty-state">暂无反馈记录</div>
          <div v-else class="feedback-items">
            <div v-for="item in myFeedback" :key="item.id" class="feedback-card">
              <div class="feedback-card-header">
                <span class="feedback-type-badge" :class="item.type">{{ item.type === 'bug' ? 'Bug问题' : item.type === 'suggestion' ? '功能建议' : '其他' }}</span>
                <span class="feedback-status-badge" :class="item.status">{{ item.status === 'pending' ? '待处理' : item.status === 'replied' ? '已回复' : '已关闭' }}</span>
              </div>
              <div class="feedback-card-title">{{ item.title }}</div>
              <div class="feedback-card-content">{{ item.content }}</div>
              <div v-if="item.reply" class="feedback-reply">
                <div class="feedback-reply-label">管理员回复：</div>
                <div class="feedback-reply-content">{{ item.reply }}</div>
              </div>
              <div class="feedback-card-time">{{ formatDate(item.created_at) }}</div>
            </div>
          </div>
          <div v-if="myFeedbackTotalPages > 1" class="pagination">
            <button class="page-btn" :disabled="myFeedbackPage === 1" @click="myFeedbackPage--; loadMyFeedback()">上一页</button>
            <span class="page-info">{{ myFeedbackPage }} / {{ myFeedbackTotalPages }}</span>
            <button class="page-btn" :disabled="myFeedbackPage === myFeedbackTotalPages" @click="myFeedbackPage++; loadMyFeedback()">下一页</button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="uploadEditVisible" class="upload-edit-modal" @click.self="closeUploadEdit">
        <div class="upload-edit-card">
          <h3 class="upload-edit-title">编辑伴奏信息</h3>
          <div class="upload-edit-form">
            <div class="form-group">
              <label class="form-label">伴奏封面</label>
              <div class="upload-cover-panel">
                <div v-if="uploadEditCoverPreview" class="upload-cover-preview">
                  <img :src="uploadEditCoverPreview" alt="伴奏封面预览" />
                </div>
                <div v-else class="upload-cover-placeholder">暂无封面</div>
                <div class="upload-cover-actions">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    class="upload-cover-input"
                    @change="onUploadEditCoverChange"
                  />
                  <p class="upload-cover-hint">支持 jpg / png / webp，保存后会替换当前伴奏图片。</p>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">标题</label>
              <input v-model="uploadEditForm.title" type="text" class="form-input" placeholder="输入伴奏标题" />
            </div>
            <div class="form-group">
              <label class="form-label">制作人</label>
              <input v-model="uploadEditForm.producer" type="text" class="form-input" placeholder="输入制作人名称" />
            </div>
            <div class="form-group">
              <label class="form-label">一级风格</label>
              <select v-model="uploadEditGenreCategory" class="form-input" @change="onUploadEditGenreCategoryChange">
                <option v-for="category in genreCategoryOptions" :key="category.value" :value="category.value">
                  {{ category.label }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">二级风格</label>
              <select v-model="uploadEditForm.genre" class="form-input">
                <option v-for="genre in uploadGenreChildOptions" :key="genre.value" :value="genre.value">
                  {{ genre.label }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">BPM</label>
              <input v-model.number="uploadEditForm.bpm" type="number" :min="BPM_MIN" :max="BPM_MAX" class="form-input" placeholder="例如 140" />
            </div>
            <div class="form-group">
              <label class="form-label">标签</label>
              <input v-model="uploadEditForm.tags" type="text" class="form-input" placeholder="例如 trap, dark, freestyle" />
            </div>
            <label class="upload-free-toggle">
              <input v-model="uploadEditForm.is_free" type="checkbox" />
              <span>设为免费伴奏</span>
            </label>
          </div>
          <div class="upload-edit-actions">
            <button type="button" class="manage-btn" :disabled="uploadEditLoading" @click="closeUploadEdit">取消</button>
            <button type="button" class="btn btn-primary" :disabled="uploadEditLoading" @click="saveUploadEdit">
              <span v-if="uploadEditLoading" class="spinner"></span>
              <span v-else>保存修改</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.profile-page {
  width:80%;
  padding-top: 40px;
  padding-bottom: 80px;
  min-height: calc(100vh - 64px);
}

/* 用户信息区 */
.profile-hero {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 32px 0 36px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 28px;
}

.avatar-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 28px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-name {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.profile-email {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.profile-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.role-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 20px;
  letter-spacing: 0.5px;
}

.role-admin {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
  border: 1px solid rgba(234, 179, 8, 0.3);
}

.role-user {
  background: var(--accent-light);
  color: var(--accent);
  border: 1px solid rgba(124, 58, 237, 0.3);
}

.points-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 20px;
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.join-date {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Tab 栏 */
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 32px;
}

.tab-btn {
  padding: 14px 24px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
  position: relative;
  top: 1px;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* Tab 内容区 */
.tab-content {
  min-height: 300px;
}

/* 积分中心 */
.points-overview {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  border-radius: 16px;
  margin-bottom: 16px;
}

.points-overview .points-icon {
  width: 56px;
  height: 56px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.points-overview .points-info {
  flex: 1;
}

.points-overview .points-value {
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.points-overview .points-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 4px;
}

.points-overview .points-detail-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.points-overview .points-detail-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.sign-in-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.sign-in-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.sign-in-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 14px;
}

.sign-in-streak {
  font-size: 12px;
  color: #f59e0b;
  font-weight: 600;
}

.sign-in-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sign-in-points {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.sign-in-points .points-amount {
  font-size: 24px;
  font-weight: 700;
  color: #f59e0b;
}

.sign-in-points .points-unit {
  font-size: 12px;
  color: var(--text-secondary);
}

.sign-in-btn {
  padding: 10px 24px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.sign-in-btn:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
}

.sign-in-btn.disabled {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: not-allowed;
}

.sign-in-btn.loading {
  opacity: 0.7;
}

.points-tasks {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.tasks-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 10px;
}

.task-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-info {
  flex: 1;
}

.task-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.task-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

.task-reward {
  font-size: 14px;
  font-weight: 700;
  color: #22c55e;
}

.streak-rewards {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}

.rewards-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.rewards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.reward-item {
  text-align: center;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.reward-days {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.reward-points {
  font-size: 14px;
  font-weight: 700;
  color: #f59e0b;
}

/* 伴奏网格 */
.beats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

/* 下载记录列表 */
.download-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.download-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.download-item:hover {
  border-color: var(--accent);
  background: var(--bg-card);
}

.dl-cover {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.dl-info {
  flex: 1;
  min-width: 0;
}

.dl-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dl-producer {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.dl-time {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: var(--text-secondary);
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 15px;
  margin: 0;
}

/* 加载状态 */
.loading-state {
  text-align: center;
  padding: 80px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 32px;
}

.page-btn {
  padding: 8px 20px;
  font-size: 13px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--text-secondary);
}

.uploads-msg {
  margin-bottom: 20px;
}

.uploads-manage-grid {
  align-items: start;
}

.upload-manage-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-manage-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.manage-btn {
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.manage-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.manage-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.manage-btn-danger {
  color: #ef4444;
}

.manage-btn-danger:hover {
  border-color: rgba(239, 68, 68, 0.5);
  color: #ef4444;
}

.upload-edit-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 1000;
}

.upload-edit-card {
  width: min(100%, 520px);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}

.upload-edit-title {
  margin: 0 0 18px;
  font-size: 20px;
  font-weight: 700;
}

.upload-edit-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.upload-cover-panel {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.upload-cover-preview,
.upload-cover-placeholder {
  width: 112px;
  height: 112px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  overflow: hidden;
  flex-shrink: 0;
}

.upload-cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.upload-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.upload-cover-actions {
  flex: 1;
}

.upload-cover-input {
  width: 100%;
  color: var(--text-secondary);
}

.upload-cover-hint {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.upload-free-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}

.upload-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

/* 设置表单 */
.settings-section {
  max-width: 480px;
  margin-bottom: 48px;
}

.avatar-settings {
  display: flex;
  align-items: center;
  gap: 20px;
}

.avatar-circle-large {
  width: 96px;
  height: 96px;
  font-size: 36px;
}

.avatar-actions {
  flex: 1;
}

.avatar-button-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.avatar-input {
  width: 100%;
  margin-bottom: 10px;
  color: var(--text-secondary);
}

.avatar-hint {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.avatar-reset-btn {
  padding: 10px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
}

.avatar-reset-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.5;
}

.form-input:focus {
  border-color: var(--accent);
}

.save-btn {
  align-self: flex-start;
  padding: 10px 28px;
  font-size: 14px;
}

.save-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.success-msg {
  background: rgba(22, 163, 74, 0.1);
  color: #16a34a;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  border: 1px solid rgba(22, 163, 74, 0.2);
  margin-bottom: 16px;
}

.error-msg {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  border: 1px solid rgba(239, 68, 68, 0.2);
  margin-bottom: 16px;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ─── 论坛模块 ──────────────────────────────────────────────────────────────── */
.forum-action-msg {
  margin-bottom: 16px;
}

.forum-layout {
  display: flex;
  gap: 28px;
  align-items: flex-start;
}

.forum-sub-tabs {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  width: 120px;
  border-right: 1px solid var(--border);
  padding-right: 20px;
}

.forum-sub-content {
  flex: 1;
  min-width: 0;
}

.forum-sub-tab {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
  white-space: nowrap;
  text-align: left;
}

.forum-sub-tab:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.forum-sub-tab.active {
  color: var(--accent);
  background: rgba(124, 58, 237, 0.08);
  font-weight: 600;
}

/* 帖子列表 */
.forum-post-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.forum-post-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  position: relative;
}

.forum-post-item:hover {
  border-color: var(--accent);
  background: var(--bg-card);
}

.forum-post-left {
  flex: 1;
  min-width: 0;
}

.forum-post-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.forum-post-preview {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.5;
}

.forum-post-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.forum-post-cat {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 20px;
  border: 1px solid rgba(124, 58, 237, 0.3);
}

.forum-post-author {
  font-size: 12px;
  color: var(--text-secondary);
}

.forum-post-stat {
  font-size: 12px;
  color: var(--text-secondary);
}

.forum-post-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.pin-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: #f59e0b;
  color: #fff;
  border-radius: 4px;
  font-weight: 700;
}

.essence-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: #ec4899;
  color: #fff;
  border-radius: 4px;
  font-weight: 700;
}

.forum-post-thumb {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.forum-post-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.forum-post-delete {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.forum-post-delete:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* 评论列表 */
.forum-comment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.forum-comment-item {
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.forum-comment-item:hover {
  border-color: var(--accent);
  background: var(--bg-card);
}

.forum-comment-post-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forum-comment-content {
  font-size: 14px;
  margin: 0 0 8px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.5;
}

/* 音频记录 */
.audio-record-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.audio-record-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-secondary);
}

.audio-record-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audio-record-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: var(--accent);
  background: var(--accent-light);
}

.audio-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  opacity: 0;
  transition: opacity 0.2s;
}

.audio-record-cover:hover .audio-play-overlay {
  opacity: 1;
}

.audio-record-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.audio-record-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-record-artist {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.audio-record-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.audio-record-meta span {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 图片记录 */
.forum-images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.forum-image-item {
  border-radius: var(--radius-sm);
  overflow: hidden;
  aspect-ratio: 1;
  cursor: pointer;
  border: 1px solid var(--border);
  transition: border-color 0.2s;
}

.forum-image-item:hover {
  border-color: var(--accent);
}

.forum-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

@media (max-width: 640px) {
  .forum-layout {
    flex-direction: column;
  }
  .forum-sub-tabs {
    flex-direction: row;
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding-right: 0;
    padding-bottom: 12px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .forum-sub-tabs::-webkit-scrollbar {
    display: none;
  }
  .forum-sub-tab {
    flex-shrink: 0;
    text-align: center;
    border-radius: 20px;
  }
  .forum-sub-tab.active {
    background: rgba(124, 58, 237, 0.08);
  }
  .profile-hero {
    gap: 16px;
  }
  .avatar-circle {
    width: 56px;
    height: 56px;
    font-size: 22px;
  }
  .profile-name {
    font-size: 20px;
  }
  .tab-btn {
    padding: 12px 14px;
    font-size: 13px;
  }
  .beats-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 14px;
  }
  .membership-header {
    flex-direction: column;
  }
  .membership-stats,
  .membership-benefits-list {
    grid-template-columns: 1fr;
  }
  .upload-manage-actions,
  .upload-edit-actions {
    flex-direction: column;
  }
  .upload-cover-panel {
    flex-direction: column;
  }
  .manage-btn,
  .upload-edit-actions .btn {
    width: 100%;
  }
  .avatar-settings {
    flex-direction: column;
    align-items: flex-start;
  }
}

/* 意见反馈 */
.feedback-section {
  padding: 0 4px;
}

.feedback-form {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-select {
  width: 100%;
  padding: 10px 14px;
  background: #1e1e3a;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.form-select:focus { border-color: #7c3aed; }

.form-textarea {
  width: 100%;
  padding: 10px 14px;
  background: #1e1e3a;
  border: 1px solid #2a2a45;
  border-radius: 8px;
  color: #e0e0e8;
  font-size: 14px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s;
}
.form-textarea:focus { border-color: #7c3aed; }

.char-count {
  text-align: right;
  font-size: 12px;
  color: #6b6b80;
  margin-top: 4px;
}

.success-message {
  color: #4ade80;
  font-size: 14px;
  padding: 8px 12px;
  background: rgba(74,222,128,0.1);
  border-radius: 6px;
}

.my-feedback-list { margin-top: 32px; }

.feedback-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.feedback-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 16px;
}

.feedback-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.feedback-type-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
}
.feedback-type-badge.bug { background: rgba(239,68,68,0.15); color: #f87171; }
.feedback-type-badge.suggestion { background: rgba(234,179,8,0.15); color: #fbbf24; }
.feedback-type-badge.other { background: rgba(59,130,246,0.15); color: #60a5fa; }

.feedback-status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
}
.feedback-status-badge.pending { background: rgba(234,179,8,0.15); color: #fbbf24; }
.feedback-status-badge.replied { background: rgba(74,222,128,0.15); color: #4ade80; }
.feedback-status-badge.closed { background: rgba(148,163,184,0.15); color: #94a3b8; }

.feedback-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e8;
  margin-bottom: 6px;
}

.feedback-card-content {
  font-size: 13px;
  color: #8888a8;
  line-height: 1.5;
  margin-bottom: 8px;
}

.feedback-reply {
  background: rgba(124,58,237,0.1);
  border-left: 3px solid #7c3aed;
  padding: 8px 12px;
  border-radius: 0 6px 6px 0;
  margin-bottom: 8px;
}
.feedback-reply-label {
  font-size: 12px;
  color: #a78bfa;
  margin-bottom: 4px;
}
.feedback-reply-content {
  font-size: 13px;
  color: #c4b5fd;
  line-height: 1.5;
}

.feedback-card-time {
  font-size: 12px;
  color: #6b6b80;
}
</style>
