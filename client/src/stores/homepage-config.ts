/**
 * 首页模块可见性配置 Store
 * 管理导航模块的显隐状态，基于用户角色过滤
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { fetchVisibleModules, type VisibleModule } from '@/api/homepage-config';
import { useAuthStore } from '@/stores/auth';

export const useHomepageConfigStore = defineStore('homepageConfig', () => {
  /** 可见模块列表 */
  const visibleModules = ref<VisibleModule[]>([]);
  /** 是否已加载 */
  const loaded = ref(false);
  /** 加载中 */
  const loading = ref(false);

  /** 可见模块的 key 集合（用于快速查找） */
  const visibleKeys = computed(() => new Set(visibleModules.value.map((m) => m.module_key)));

  /**
   * 判断某模块是否对当前用户可见
   * @param moduleKey - 模块标识（如 'nav_beats'）
   * @returns 是否可见
   */
  function isVisible(moduleKey: string): boolean {
    const auth = useAuthStore();
    // 管理员始终可见所有模块
    if (auth.isAdmin) return true;
    // 未加载完成时默认可见（避免闪烁）
    if (!loaded.value) return true;
    return visibleKeys.value.has(moduleKey);
  }

  /** 从后端加载可见模块配置 */
  async function load() {
    if (loaded.value || loading.value) return;
    loading.value = true;
    try {
      const data = await fetchVisibleModules();
      visibleModules.value = data.modules;
      loaded.value = true;
    } catch {
      // 加载失败时不阻塞页面，默认全部可见
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  /** 重置状态（退出登录时调用） */
  function reset() {
    visibleModules.value = [];
    loaded.value = false;
  }

  return {
    visibleModules,
    visibleKeys,
    loaded,
    loading,
    isVisible,
    load,
    reset,
  };
});
