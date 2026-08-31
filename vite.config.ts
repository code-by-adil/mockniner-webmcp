import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import sqlocal from 'sqlocal/vite'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), sqlocal()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@ielts/shared': fileURLToPath(new URL('./src/vendor/ielts-shared/index.ts', import.meta.url)),
    },
  },
})
