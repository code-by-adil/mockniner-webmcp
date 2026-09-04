import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import sqlocal from 'sqlocal/vite'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { audioAssets } from './scripts/audio-assets/vite.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), sqlocal(), audioAssets()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
