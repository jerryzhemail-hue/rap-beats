import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useAuthStore } from './stores/auth'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// 初始化认证状态
const authStore = useAuthStore()
authStore.init().then(() => {
  app.use(router)
  app.mount('#app')
})
