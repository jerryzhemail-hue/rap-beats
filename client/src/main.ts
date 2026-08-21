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
app.mount('#app')

// 认证初始化在 mount 之后异步进行，不阻塞页面渲染和 HMR
const authStore = useAuthStore()
authStore.init()
