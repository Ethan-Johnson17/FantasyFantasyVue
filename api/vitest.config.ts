import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Tests share one in-memory MongoDB server, so run files serially to avoid cross-file interference.
    fileParallelism: false
  }
})
