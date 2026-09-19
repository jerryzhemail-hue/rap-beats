<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchProfileFull, updateProfile, updatePassword, uploadAvatar, removeAvatar } from '@/api/user'
import { resolveAvatarUrl } from '@/utils/assets'

const authStore = useAuthStore()
const emit = defineEmits<{ (e: 'profile-saved'): void }>()

// settings
const profileUsername = ref('')
const profileEmail = ref('')
const profileNickname = ref('')  // 昵称（独立于 username）
const profileBio = ref('')       // 个人简介
const profileSuccess = ref('')
const profileError = ref('')
const profileLoading = ref(false)
const avatarFile = ref<File | null>(null)
const avatarPreviewUrl = ref('')
const avatarSuccess = ref('')
const avatarError = ref('')
const avatarLoading = ref(false)



function clearAvatarPreview() {
  if (avatarPreviewUrl.value) {
    URL.revokeObjectURL(avatarPreviewUrl.value)
    avatarPreviewUrl.value = ''
  }
}

onBeforeUnmount(() => {
  clearAvatarPreview()
})

async function saveProfile() {
  profileError.value = ''
  profileSuccess.value = ''
  if (!profileUsername.value.trim() || !profileEmail.value.trim()) {
    profileError.value = '用户名和邮箱不能为空'
    return
  }
  if (profileNickname.value && (profileNickname.value.length < 2 || profileNickname.value.length > 20)) {
    profileError.value = '昵称需要2-20个字符'
    return
  }
  if (profileBio.value.length > 500) {
    profileError.value = '个人简介不能超过 500 字符'
    return
  }
  profileLoading.value = true
  try {
    const data: any = await updateProfile({
      username: profileUsername.value.trim(),
      email: profileEmail.value.trim(),
      nickname: profileNickname.value.trim() || undefined,
      bio: profileBio.value.trim() || undefined,
    })
    profileSuccess.value = data.message || '更新成功'
    if (data.user && authStore.user) {
      authStore.user.username = data.user.username
      authStore.user.email = data.user.email
    }
    emit('profile-saved')
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


const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordSuccess = ref('')
const passwordError = ref('')
const passwordLoading = ref(false)

const user = computed(() => authStore.user)

const avatarLetter = computed(() => {
  return (user.value?.username || '?')[0].toUpperCase()
})

const avatarSrc = computed(() => {
  if (avatarPreviewUrl.value) return avatarPreviewUrl.value
  if (user.value?.avatar_url) return resolveAvatarUrl(user.value.avatar_url)
  return ''
})

onBeforeUnmount(() => {
  if (avatarPreviewUrl.value && avatarPreviewUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(avatarPreviewUrl.value)
  }
})


onMounted(async () => {
  profileUsername.value = authStore.user?.username || ''
  profileEmail.value = authStore.user?.email || ''
  try {
    const full = await fetchProfileFull(undefined)
    if (full) {
      profileNickname.value = full.nickname || ''
      profileBio.value = full.bio || ''
    }
  } catch {}
})
</script>

<template>
    <div class="tab-content">
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
            <label class="form-label">RAP BEATS 账号（登录名）</label>
            <input v-model="profileUsername" type="text" class="form-input" placeholder="3-20个字符" />
          </div>
          <div class="form-group">
            <label class="form-label">昵称（仅自己可编辑，对外显示）</label>
            <input v-model="profileNickname" type="text" class="form-input" placeholder="2-20个字符，留空回退账号名" maxlength="20" />
          </div>
          <div class="form-group">
            <label class="form-label">邮箱</label>
            <input v-model="profileEmail" type="email" class="form-input" placeholder="输入邮箱" />
          </div>
          <div class="form-group">
            <label class="form-label">个人简介</label>
            <textarea v-model="profileBio" class="form-textarea" placeholder="介绍一下自己吧，最多500字" maxlength="500" rows="3"></textarea>
            <span class="form-hint">{{ profileBio.length }}/500</span>
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
</template>
