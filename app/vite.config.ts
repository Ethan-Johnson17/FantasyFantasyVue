/// <reference types="vitest/config" />
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  // Port 8080 is already an allowed origin in Auth0 and the API's CORS list.
  server: { port: 8080, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts']
  }
})
