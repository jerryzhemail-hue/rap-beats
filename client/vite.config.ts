import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    base: env.VITE_BASE_URL || '/',
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
        '/audio': 'http://localhost:3000',
        '/covers': 'http://localhost:3000',
        '/avatars': 'http://localhost:3000'
      }
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['vue', 'vue-router', 'pinia']
          }
        }
      }
    }
  }
})
