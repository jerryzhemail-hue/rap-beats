<script setup lang="ts">
/**
 * 用户头像组件
 * - 有 avatar 时显示图片
 * - 无 avatar 时显示首字母占位（基于用户名首字母自动配色）
 */
const props = withDefaults(defineProps<{
  src?: string | null
  username?: string | null
  size?: number
  /** 圆度，0-50 */
  radius?: number
}>(), {
  src: '',
  username: '',
  size: 40,
  radius: 50,
})

function getInitial(name: string | null | undefined) {
  const trimmed = (name || '').trim()
  if (!trimmed) return '?'
  // 取第一个字符（支持中文）
  return trimmed.charAt(0).toUpperCase()
}

function getColor(name: string | null | undefined) {
  const trimmed = (name || '').trim()
  if (!trimmed) return '#5b5b6b'
  // 基于用户名生成稳定的哈希值 → 颜色
  let hash = 0
  for (let i = 0; i < trimmed.length; i++) {
    hash = trimmed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  ]
  const idx = Math.abs(hash) % colors.length
  return colors[idx]
}

const initial = getInitial(props.username)
const bgColor = getColor(props.username)
</script>

<template>
  <div
    class="user-avatar"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${radius}%`,
      background: bgColor,
      fontSize: `${Math.max(12, size * 0.45)}px`,
    }"
  >
    <img
      v-if="src"
      :src="src"
      :alt="username || '用户'"
      class="avatar-img"
      @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
    />
    <span v-else class="avatar-initial">{{ initial }}</span>
  </div>
</template>

<style scoped>
.user-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #fff;
  font-weight: 600;
  user-select: none;
  flex-shrink: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initial {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
</style>
