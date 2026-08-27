<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'solid' | 'subtle'
  showLabel?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  variant: 'subtle',
  showLabel: true
})

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm': return 'badge-sm'
    case 'lg': return 'badge-lg'
    default: return 'badge-md'
  }
})

const variantClass = computed(() => props.variant === 'solid' ? 'badge-solid' : 'badge-subtle')
</script>

<template>
  <span class="beatmaker-badge" :class="[sizeClass, variantClass]" title="已认证 Beatmaker 原创制作人">
    <svg class="badge-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
    </svg>
    <span v-if="showLabel" class="badge-label">认证 Beatmaker</span>
  </span>
</template>

<style scoped>
.beatmaker-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  font-weight: 600;
  white-space: nowrap;
  user-select: none;
}

.badge-icon { flex-shrink: 0; }

.badge-sm {
  font-size: 11px;
  padding: 2px 8px;
  gap: 3px;
}
.badge-sm .badge-icon { width: 12px; height: 12px; }

.badge-md {
  font-size: 13px;
  padding: 4px 10px;
  gap: 4px;
}
.badge-md .badge-icon { width: 14px; height: 14px; }

.badge-lg {
  font-size: 15px;
  padding: 6px 14px;
  gap: 6px;
}
.badge-lg .badge-icon { width: 18px; height: 18px; }

.badge-solid {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
}

.badge-subtle {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

@media (prefers-color-scheme: dark) {
  .badge-subtle { color: #fbbf24; border-color: rgba(245, 158, 11, 0.4); }
}
</style>