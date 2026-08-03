<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  showClose?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
  close: []
}>()

const modalRef = ref<HTMLElement>()

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    handleCancel()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    handleCancel()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.body.style.overflow = 'hidden'
  modalRef.value?.focus()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click="handleBackdropClick">
      <div class="modal-container" ref="modalRef" role="dialog" aria-modal="true" tabindex="-1">
        <button v-if="showClose" class="modal-close" @click="handleCancel" aria-label="关闭">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        
        <div v-if="title || $slots.icon" class="modal-icon">
          <slot name="icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
          </slot>
        </div>
        
        <h3 v-if="title" class="modal-title">{{ title }}</h3>
        
        <p class="modal-message">{{ message }}</p>
        
        <div class="modal-actions">
          <button class="modal-btn modal-btn-secondary" @click="handleCancel">
            {{ cancelText || '取消' }}
          </button>
          <button class="modal-btn modal-btn-primary" @click="handleConfirm">
            {{ confirmText || '确定' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-container {
  background: var(--bg-card, #252540);
  border-radius: 16px;
  padding: 32px;
  max-width: 400px;
  width: calc(100% - 32px);
  text-align: center;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: transparent;
  border: none;
  color: var(--text-secondary, #888);
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: all 0.2s;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #fff);
}

.modal-icon {
  color: var(--accent, #7c3aed);
  margin-bottom: 16px;
}

.modal-icon :deep(svg) {
  width: 56px;
  height: 56px;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, #fff);
  margin: 0 0 12px 0;
}

.modal-message {
  font-size: 15px;
  color: var(--text-secondary, #b0b0b0);
  line-height: 1.6;
  margin: 0 0 28px 0;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.modal-btn {
  padding: 12px 28px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 100px;
}

.modal-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary, #b0b0b0);
}

.modal-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  color: var(--text-primary, #fff);
}

.modal-btn-primary {
  background: var(--accent, #7c3aed);
  color: #fff;
}

.modal-btn-primary:hover {
  background: var(--accent-hover, #9333ea);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
}

.modal-btn-primary:active {
  transform: translateY(0);
}
</style>
