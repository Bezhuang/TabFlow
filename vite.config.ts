import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // 支持 GitHub Pages 子路径部署
  plugins: [react()],
})
