import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useAuthStore } from './stores/auth'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// 在挂载前同步触发认证初始化（init 内部用 Promise 复用，多次调用安全）。
// 这样路由解析时 user 已经被恢复，避免刷新 /upload 等页面被误判为未登录跳转到 /login。
const authStore = useAuthStore()
authStore.init().finally(() => {
  app.mount('#app')
})
