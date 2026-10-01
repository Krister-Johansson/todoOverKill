import { defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'

import { loadDotEnv } from './src/lib/load-dot-env.ts'

export default defineConfig(({ mode }) => {
  // Runs in the main process before the global setup and before any worker
  // starts, and workers inherit process.env, so src/env.ts validates in every
  // test file. Variables exported in the shell win over .env, as in
  // vite.config.ts.
  loadDotEnv(mode, process.cwd())

  return {
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      // Applies migrations to the DATABASE_URL_TEST database.
      globalSetup: ['./src/test/global-setup.ts'],
    },
  }
})
