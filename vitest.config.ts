import { configDefaults, defineConfig } from 'vitest/config'
import viteReact from '@vitejs/plugin-react'

import { loadDotEnv } from './src/lib/load-dot-env.ts'

// Test files that run server code against the test database.
const serverTests = [
  'src/server/**/*.test.ts',
  'src/fns/**/*.test.ts',
  'src/tools/**/*.test.ts',
  'src/routes/api/**/*.test.ts',
]

export default defineConfig(({ mode }) => {
  // Runs in the main process before the global setup and before any worker
  // starts, and workers inherit process.env, so optional variables such as
  // OPENROUTER_MODEL keep their .env values in tests. Variables exported in the
  // shell win over .env, as in vite.config.ts. The database URLs come from the
  // global setup instead, so a checkout without .env runs the tests too.
  loadDotEnv(mode, process.cwd())

  return {
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
      // Starts and migrates a PostgreSQL container for this run. Projects do
      // not inherit it, so it runs once per run rather than once per project.
      globalSetup: ['./src/test/global-setup.ts'],
      // Each project inherits resolve, plugins, and the root test options.
      // Arrays such as include are concatenated with the project's, so include
      // and setupFiles live only in the projects.
      projects: [
        {
          test: {
            name: 'server',
            environment: 'node',
            include: serverTests,
            // The files share one database and each empties it first.
            fileParallelism: false,
            // In this order: setup-server.ts imports src/env.ts, which needs
            // the URL that setup-database-url.ts puts in process.env.
            setupFiles: [
              './src/test/setup-database-url.ts',
              './src/test/setup-server.ts',
            ],
          },
        },
        {
          test: {
            name: 'client',
            environment: 'jsdom',
            include: ['src/**/*.test.{ts,tsx}'],
            // A project exclude replaces Vitest's defaults instead of adding
            // to them, so they are listed again.
            exclude: [...configDefaults.exclude, ...serverTests],
            // Files here that import server code load src/env.ts, which
            // requires DATABASE_URL.
            setupFiles: ['./src/test/setup-database-url.ts'],
          },
        },
      ],
    },
  }
})
