import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDev = mode === 'development'

  return {
    plugins: [vue()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      }
    },

    // 预构建依赖：将常用第三方库提前打包为 ESM，减少 dev 启动和热更新时的重复解析
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'pinia',
        'dompurify',
        'twemoji',
      ],
      // 预构建排除：某些包在 dev 时需要保持 ESM 原样（如已兼容的库），避免破坏原生 ESM
      exclude: [],
    },

    base: env.VITE_BASE_URL || '/',

    server: {
      strictPort: false,
      port: 5173,
      hmr: {
        port: 5173,
      },
      watch: {
        // 排除不需要监听的文件，减少文件系统开销，提升 HMR 响应速度
        ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/dist-ssr/**'],
      },
      // 生产构建时通过 vite preview 测试，本地 dev 不需要额外配置
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          ws: true,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes, req) => {
              if (req.url && req.url.includes('/messages/stream')) {
                proxyRes.headers['x-accel-buffering'] = 'no'
                proxyRes.headers['cache-control'] = 'no-cache'
                delete proxyRes.headers['content-length']
              }
            })
          },
        },
        '/audio': 'http://localhost:3000',
        '/covers': 'http://localhost:3000',
        '/avatars': 'http://localhost:3000',
        '/banners': 'http://localhost:3000',
        '/forum-images': 'http://localhost:3000',
        '/forum-audio': 'http://localhost:3000',
      },
    },

    // CSS 相关配置
    css: {
      // 按需转换 calc() 等现代 CSS 特性，减少兼容性问题
      preprocessorOptions: {},
      // 始终开启源码映射，方便调试样式来源
      devSourcemap: isDev,
    },

    // esbuild 优化：更快的构建 + 更好的压缩
    esbuild: {
      // 保留类组件的原始命名，利于调试时快速定位
      keepNames: true,
      // 生产环境启用 tree-shaking 友好的死代码消除
      treeShaking: true,
    },

    build: {
      outDir: 'dist',
      // 生成 .vite 目录下的 assets，减少根目录污染
      assetsDir: 'assets',
      // 小于此值（字节）的资源以内联形式嵌入，减少请求数
      assetsInlineLimit: 4096,
      // 启用 CSS 代码分割，每个异步 chunk 独立 CSS 文件，便于长期缓存
      cssCodeSplit: true,
      // 构建目标：现代浏览器，无需转换 ES2020+ 语法
      target: 'es2020',
      // 生产环境启用源码映射（独立 .map 文件），方便线上问题定位
      sourcemap: isDev ? false : 'hidden',
      // Rollup 打包配置
      rollupOptions: {
        output: {
          // 手动分包策略：按模块性质拆分，实现更好的长期缓存
          manualChunks(id) {
            if (!id.includes('node_modules')) return

            // 框架核心：几乎不变，独立 chunk，复用率高
            if (/vue|pinia|vue-router/.test(id)) return 'vendor-framework'
            // 大型工具库：体积大但稳定，独立 chunk
            if (/echarts|dayjs|lodash|@iconify/.test(id)) return 'vendor-libs'
            // 其他第三方依赖全部合为一个 fallback chunk
            return 'vendor-misc'
          },
          // 静态资源文件名带 hash，长期缓存友好
          assetFileNames: 'assets/[name]-[hash][extname]',
          // JS 文件名带 hash，命中缓存控制
          chunkFileNames: 'js/[name]-[hash].js',
          // 入口文件名称固定，不带 hash（只有一个，热更新影响小）
          entryFileNames: 'js/[name].js',
        },
      },
      // 开启 rollup 的 minify，默认使用 esbuild（比 terser 快 20-40x）
      minify: 'esbuild',
      // 超过此值的 JS 会触发警告，提示考虑分包
      chunkSizeWarningLimit: 500,
    },
  }
})
