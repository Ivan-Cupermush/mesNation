import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Dev-сервер Vite — только для разработки на своём компьютере.
 * В продакшене сайт собирается (`npm run build`) и раздаётся сервером Node
 * с того же адреса, что и API (см. server/src/web.ts и docs/DEPLOY.md).
 *
 * Для разработки все серверные пути проксируются на локальный API,
 * поэтому код сайта везде использует относительные адреса (/api, /uploads, /socket.io).
 */
const API = process.env.OFFIX_API || 'http://localhost:5000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/uploads': { target: API, changeOrigin: true },
      '/socket.io': { target: API, changeOrigin: true, ws: true },
    },
  },
  build: {
    sourcemap: false,
    // Предупреждение о крупных чанках не мешает: графики KPI грузятся отдельно, лениво.
    chunkSizeWarningLimit: 800,
  },
})
