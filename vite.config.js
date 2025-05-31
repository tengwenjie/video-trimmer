import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server:{
    port: 3000,
    open: true
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] // 关键！跳过预处理
  },
  assetsInclude: ['**/*.wasm'] // 确保 .wasm 能被正确加载
})
