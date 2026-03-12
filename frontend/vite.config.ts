import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@notes/shared': path.resolve(__dirname, '../packages/shared/src/index.ts')
    }
  },
  optimizeDeps: {
    include: ['@notes/shared']
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
