<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchModuleConfigs, updateModuleConfigs } from '@/api/homepage-config'
import type { ModuleConfigItem } from '@/api/homepage-config'

interface RoleKey {
  field: 'visible_to_guest' | 'visible_to_user' | 'visible_to_vip' | 'visible_to_beatmaker' | 'visible_to_admin'
  label: string
  desc: string
}

const roleColumns: RoleKey[] = [
  { field: 'visible_to_guest', label: '游客', desc: '未登录访客' },
  { field: 'visible_to_user', label: '注册用户', desc: '已登录普通用户' },
  { field: 'visible_to_vip', label: 'VIP', desc: '任意等级 VIP 用户' },
  { field: 'visible_to_beatmaker', label: 'Beatmaker', desc: '认证 Beatmaker' },
  { field: 'visible_to_admin', label: '管理员', desc: '后台管理员' }
]

const items = ref<ModuleConfigItem[]>([])
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

function showMessage(text: string, type: 'success' | 'error' = 'success') {
  message.value = text
  messageType.value = type
  window.setTimeout(() => {
    if (message.value === text) message.value = ''
  }, 2400)
}

function formatTime(value: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

async function load() {
  loading.value = true
  try {
    const data = await fetchModuleConfigs()
    items.value = data.items
  } catch (error: any) {
    showMessage(error.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

function toggle(item: ModuleConfigItem, field: RoleKey['field']) {
  ;(item[field] as number) = item[field] === 1 ? 0 : 1
}

async function save() {
  saving.value = true
  try {
    await updateModuleConfigs(
      items.value.map((it) => ({
        module_key: it.module_key,
        visible_to_guest: it.visible_to_guest === 1,
        visible_to_user: it.visible_to_user === 1,
        visible_to_vip: it.visible_to_vip === 1,
        visible_to_beatmaker: it.visible_to_beatmaker === 1,
        visible_to_admin: it.visible_to_admin === 1
      }))
    )
    showMessage('配置已保存，前台将立即生效')
    await load()
  } catch (error: any) {
    showMessage(error.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="homepage-config">
    <div class="config-header">
      <div class="config-title">
        <h2>首页头部模块可见性配置</h2>
        <p class="config-desc">
          控制首页顶部导航中各模块入口对不同角色的显示/隐藏。关闭后对应角色将无法在导航看到入口，且直接访问该路由也会被拦截。
        </p>
      </div>
      <button class="btn-save" :disabled="saving || loading" @click="save">
        {{ saving ? '保存中…' : '保存配置' }}
      </button>
    </div>

    <div v-if="message" class="config-toast" :class="messageType">{{ message }}</div>

    <div v-if="loading" class="config-loading">加载中…</div>

    <div v-else-if="items.length === 0" class="config-empty">暂无配置项</div>

    <div v-else class="config-table-wrap">
      <table class="config-table">
        <thead>
          <tr>
            <th class="col-module">模块</th>
            <th class="col-sort">排序</th>
            <th v-for="col in roleColumns" :key="col.field" class="col-role">
              <div class="role-label">{{ col.label }}</div>
              <div class="role-desc">{{ col.desc }}</div>
            </th>
            <th class="col-updated">最近更新</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.module_key">
            <td class="col-module">
              <div class="module-key">{{ item.module_key }}</div>
              <div class="module-label">{{ item.module_label }}</div>
            </td>
            <td class="col-sort">{{ item.sort_order }}</td>
            <td v-for="col in roleColumns" :key="col.field" class="col-role">
              <label class="toggle-cell">
                <input
                  type="checkbox"
                  :checked="item[col.field] === 1"
                  @change="toggle(item, col.field)"
                />
                <span class="toggle-switch" :class="{ on: item[col.field] === 1 }">
                  <span class="toggle-knob"></span>
                </span>
              </label>
            </td>
            <td class="col-updated">{{ formatTime(item.updated_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="config-tips">
      <h3>使用说明</h3>
      <ul>
        <li><b>游客</b>：未登录的访客，关闭后导航不显示该入口。</li>
        <li><b>注册用户</b>：已登录但非 VIP、非 Beatmaker、非管理员的普通用户。</li>
        <li><b>VIP</b>：任意有效 VIP 等级（basic / premium / ultimate）。</li>
        <li><b>Beatmaker</b>：已通过认证的 Beatmaker。</li>
        <li><b>管理员</b>：后台管理员，默认全部可见，建议保持开启。</li>
        <li>保存后配置立即生效，已登录用户下次刷新页面即可看到变化。</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.homepage-config {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.config-title h2 {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #fff);
}

.config-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #a0a0b0);
  max-width: 720px;
  line-height: 1.6;
}

.btn-save {
  padding: 10px 24px;
  border-radius: 8px;
  background: var(--accent, #7c3aed);
  color: #fff;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  flex-shrink: 0;
}

.btn-save:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-save:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.config-toast {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
}

.config-toast.success {
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.config-toast.error {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.config-loading,
.config-empty {
  padding: 48px;
  text-align: center;
  color: var(--text-secondary, #a0a0b0);
  font-size: 14px;
}

.config-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border, #1e1e3a);
  border-radius: 12px;
  background: var(--bg-card, #141425);
}

.config-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
}

.config-table thead th {
  padding: 14px 12px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #fff);
  background: var(--bg-secondary, #0f0f1a);
  border-bottom: 1px solid var(--border, #1e1e3a);
  white-space: nowrap;
}

.config-table thead th.col-module,
.config-table thead th.col-sort,
.config-table thead th.col-updated {
  text-align: left;
}

.role-label {
  font-weight: 700;
}

.role-desc {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-secondary, #a0a0b0);
  margin-top: 2px;
}

.config-table tbody td {
  padding: 16px 12px;
  text-align: center;
  border-bottom: 1px solid var(--border, #1e1e3a);
  font-size: 13px;
  color: var(--text-primary, #e8e8ed);
}

.config-table tbody tr:last-child td {
  border-bottom: none;
}

.col-module {
  text-align: left;
}

.module-key {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 12px;
  color: var(--text-secondary, #a0a0b0);
}

.module-label {
  font-weight: 600;
  margin-top: 2px;
}

.col-sort {
  text-align: center;
  color: var(--text-secondary, #a0a0b0);
}

.col-updated {
  text-align: left;
  font-size: 12px;
  color: var(--text-secondary, #a0a0b0);
  white-space: nowrap;
}

.toggle-cell {
  display: inline-flex;
  cursor: pointer;
  user-select: none;
}

.toggle-cell input {
  display: none;
}

.toggle-switch {
  width: 38px;
  height: 22px;
  border-radius: 11px;
  background: var(--bg-secondary, #2a2a3a);
  border: 1px solid var(--border, #1e1e3a);
  position: relative;
  transition: background 0.2s ease;
}

.toggle-switch.on {
  background: var(--accent, #7c3aed);
  border-color: var(--accent, #7c3aed);
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}

.toggle-switch.on .toggle-knob {
  transform: translateX(16px);
}

.config-tips {
  padding: 16px 20px;
  border: 1px solid var(--border, #1e1e3a);
  border-radius: 12px;
  background: var(--bg-card, #141425);
}

.config-tips h3 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, #fff);
}

.config-tips ul {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.config-tips li {
  font-size: 13px;
  color: var(--text-secondary, #a0a0b0);
  line-height: 1.6;
}

.config-tips li b {
  color: var(--text-primary, #e8e8ed);
  font-weight: 600;
}

@media (max-width: 768px) {
  .config-header {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-save {
    width: 100%;
  }
}
</style>
