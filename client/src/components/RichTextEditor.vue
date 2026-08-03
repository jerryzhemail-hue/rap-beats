<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import EmojiPicker from './EmojiPicker.vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'insert-image', files: File[]): void
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const showEmoji = ref(false)
const showLinkInput = ref(false)
const linkUrl = ref('')
const linkText = ref('')
const isDragOver = ref(false)

// 格式化命令
function execCommand(command: string, value: string | undefined = undefined) {
  editorRef.value?.focus()
  document.execCommand(command, false, value)
  updateContent()
}

function toggleBold() { execCommand('bold') }
function toggleItalic() { execCommand('italic') }
function toggleStrikeThrough() { execCommand('strikeThrough') }
function toggleOrderedList() { execCommand('insertOrderedList') }
function toggleUnorderedList() { execCommand('insertUnorderedList') }

function formatBlock(tag: string) {
  editorRef.value?.focus()
  document.execCommand('formatBlock', false, tag)
  updateContent()
}

function insertQuote() {
  execCommand('formatBlock', 'blockquote')
}

function insertCode() {
  execCommand('formatBlock', 'pre')
}

function insertLink() {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    linkText.value = range.toString()
  }
  showLinkInput.value = true
  linkUrl.value = ''
}

function confirmLink() {
  if (!linkUrl.value.trim()) {
    showLinkInput.value = false
    return
  }
  let url = linkUrl.value.trim()
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url
  }
  execCommand('createLink', url)
  showLinkInput.value = false
  linkUrl.value = ''
}

function insertImage() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    // 触发父组件上传图片
    emit('update:modelValue', props.modelValue + `\n[IMAGE_PLACEHOLDER:${file.name}]\n`)
  }
  input.click()
}

// 处理图片上传 - 父组件调用
function handleImageUpload(file: File, url: string) {
  const placeholder = `[IMAGE_PLACEHOLDER:${file.name}]`
  const newContent = props.modelValue.replace(placeholder, `[IMAGE:${url}]`)
  emit('update:modelValue', newContent)
}

// 在光标位置插入图片
function insertImageToContent(url: string) {
  editorRef.value?.focus()
  document.execCommand('insertHTML', false, `<img src="${url}" alt="图片" class="content-image" />`)
}

// 暴露给父组件的插入图片方法
defineExpose({
  insertImage,
  handleImageUpload,
  execCommand,
  insertImageToContent
})

function onEmojiSelect(emoji: string) {
  execCommand('insertText', emoji)
  showEmoji.value = false
}

function updateContent() {
  if (editorRef.value) {
    // 获取 HTML 内容
    const html = editorRef.value.innerHTML
    emit('update:modelValue', html)
  }
}

function handleInput() {
  updateContent()
}

function handlePaste(e: ClipboardEvent) {
  // 处理粘贴事件
  const text = e.clipboardData?.getData('text/plain')
  if (text) {
    document.execCommand('insertText', false, text)
  }
  e.preventDefault()
}

// 拖拽事件处理
function handleDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
  isDragOver.value = true
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (imageFiles.length === 0) return
  // 触发父组件上传图片（编辑器内插入图片需要走父组件的上传逻辑）
  emit('insert-image', imageFiles)
}

// 监听外部 modelValue 变化
watch(() => props.modelValue, (newVal) => {
  if (editorRef.value && editorRef.value.innerHTML !== newVal) {
    editorRef.value.innerHTML = newVal
  }
})

onMounted(() => {
  if (editorRef.value && props.modelValue) {
    editorRef.value.innerHTML = props.modelValue
  }
})

// 点击外部关闭 emoji 和 link
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.emoji-trigger') && !target.closest('.emoji-popover')) {
    showEmoji.value = false
  }
  if (!target.closest('.link-btn') && !target.closest('.link-input-wrapper')) {
    showLinkInput.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

// 工具栏按钮定义
const toolbarButtons = [
  { id: 'bold', icon: 'B', title: '粗体', action: toggleBold, class: 'bold' },
  { id: 'italic', icon: 'I', title: '斜体', action: toggleItalic, class: 'italic' },
  { id: 'underline', icon: 'U', title: '下划线', action: () => execCommand('underline'), class: 'underline' },
  { id: 'strike', icon: 'S', title: '删除线', action: toggleStrikeThrough, class: 'strike' },
  { id: 'divider1', type: 'divider' },
  { id: 'h1', icon: 'H1', title: '标题1', action: () => formatBlock('h1'), class: 'heading' },
  { id: 'h2', icon: 'H2', title: '标题2', action: () => formatBlock('h2'), class: 'heading' },
  { id: 'h3', icon: 'H3', title: '标题3', action: () => formatBlock('h3'), class: 'heading' },
  { id: 'divider2', type: 'divider' },
  { id: 'quote', icon: '❝', title: '引用', action: insertQuote, class: 'quote' },
  { id: 'code', icon: '<>', title: '代码', action: insertCode, class: 'code' },
  { id: 'divider3', type: 'divider' },
  { id: 'ul', icon: '☰', title: '无序列表', action: toggleUnorderedList, class: 'list' },
  { id: 'ol', icon: '1.', title: '有序列表', action: toggleOrderedList, class: 'list' },
  { id: 'divider4', type: 'divider' },
  { id: 'link', icon: '🔗', title: '插入链接', action: insertLink, class: 'link-btn' },
]
</script>

<template>
  <div class="rich-editor">
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <template v-for="btn in toolbarButtons" :key="btn.id">
        <div v-if="btn.type === 'divider'" class="toolbar-divider" />
        <button
          v-else
          type="button"
          class="toolbar-btn"
          :class="btn.class"
          :title="btn.title"
          @click="btn.action"
        >
          {{ btn.icon }}
        </button>
      </template>
      
      <!-- 图片按钮 -->
      <button
        type="button"
        class="toolbar-btn"
        title="插入图片"
        @click="insertImage"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </button>
      
      <!-- 表情按钮 -->
      <button
        type="button"
        class="toolbar-btn emoji-trigger"
        title="插入表情"
        @click.stop="showEmoji = !showEmoji"
      >
        😊
      </button>
      <div v-if="showEmoji" class="emoji-popover" @click.stop>
        <EmojiPicker @select="onEmojiSelect" />
      </div>
    </div>
    
    <!-- 链接输入弹窗 -->
    <div v-if="showLinkInput" class="link-input-wrapper" @click.stop>
      <input
        v-model="linkUrl"
        type="url"
        class="link-input"
        placeholder="输入链接地址..."
        @keyup.enter="confirmLink"
      />
      <button type="button" class="link-confirm" @click="confirmLink">确定</button>
      <button type="button" class="link-cancel" @click="showLinkInput = false">取消</button>
    </div>
    
    <!-- 编辑区域 -->
    <div
      ref="editorRef"
      class="editor-content"
      :class="{ 'drag-over': isDragOver }"
      contenteditable="true"
      :data-placeholder="placeholder || '请输入内容...'"
      @input="handleInput"
      @paste="handlePaste"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
    />
  </div>
</template>

<style scoped>
.rich-editor {
  background: var(--bg-secondary);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition: border-color 0.15s;
}

.rich-editor:focus-within {
  border-color: var(--accent);
}

.editor-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  position: relative;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.toolbar-btn.active {
  background: var(--accent-light);
  color: var(--accent);
}

.toolbar-btn.bold { font-weight: 800; }
.toolbar-btn.italic { font-style: italic; }
.toolbar-btn.underline { text-decoration: underline; }
.toolbar-btn.strike { text-decoration: line-through; }
.toolbar-btn.heading { font-weight: 700; font-size: 11px; }
.toolbar-btn.quote { font-size: 16px; color: var(--accent); }
.toolbar-btn.code { font-family: monospace; background: var(--bg-secondary); border-radius: 3px; }
.toolbar-btn.list { font-size: 14px; }

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
}

.emoji-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 100;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px var(--shadow);
}

.link-input-wrapper {
  display: flex;
  gap: 8px;
  padding: 10px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  position: absolute;
  top: 50px;
  left: 0;
  right: 0;
  z-index: 50;
  box-shadow: 0 4px 12px var(--shadow);
}

.link-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.link-input:focus {
  border-color: var(--accent);
}

.link-confirm {
  padding: 6px 12px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.link-cancel {
  padding: 6px 12px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.editor-content {
  min-height: 200px;
  max-height: 500px;
  overflow-y: auto;
  padding: 14px 16px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.8;
  outline: none;
  word-break: break-word;
  transition: background 0.15s;
  position: relative;
}
.editor-content.drag-over {
  background: var(--accent-light);
  outline: 2px dashed var(--accent);
  outline-offset: -4px;
}
.editor-content.drag-over::after {
  content: '松开鼠标插入图片';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--accent);
  color: #fff;
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 13px;
  pointer-events: none;
}

.editor-content:empty::before {
  content: attr(data-placeholder);
  color: var(--text-secondary);
  pointer-events: none;
}

/* 内容样式 */
.editor-content :deep(h1),
.editor-content :deep(h2),
.editor-content :deep(h3) {
  margin: 16px 0 8px;
  font-weight: 700;
  line-height: 1.3;
}

.editor-content :deep(h1) { font-size: 20px; }
.editor-content :deep(h2) { font-size: 17px; }
.editor-content :deep(h3) { font-size: 15px; }

.editor-content :deep(p) {
  margin: 8px 0;
}

.editor-content :deep(blockquote) {
  margin: 12px 0;
  padding: 10px 16px;
  border-left: 3px solid var(--accent);
  background: var(--accent-light);
  border-radius: 0 4px 4px 0;
  color: var(--text-secondary);
}

.editor-content :deep(pre) {
  margin: 12px 0;
  padding: 12px 16px;
  background: var(--bg-primary);
  border-radius: 6px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  overflow-x: auto;
}

.editor-content :deep(ul),
.editor-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.editor-content :deep(li) {
  margin: 4px 0;
}

.editor-content :deep(a) {
  color: var(--accent);
  text-decoration: underline;
}

.editor-content :deep(img) {
  max-width: 100%;
  max-height: 300px;
  border-radius: 6px;
  margin: 8px 0;
}
</style>
