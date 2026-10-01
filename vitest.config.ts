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
  // starts, and workers inherit process.env, so src/env.ts validates in every
  // test file. Variables exported in the shell win over .env, as in
  // vite.config.ts.
  loadDotEnv(mode, process.cwd())

  return {
    resolve: { tsconfigPaths: true },
    plugins: [viteReact()],
    test: {
      // Applies migrations to the DATABASE_URL_TEST database. Projects do not
      // inherit it, so it runs once per run rather than once per project.
      globalSetup: ['./src/test/global-setup.ts'],
      // Each project inherits resolve, plugins, and the root test options.
      // Arrays such as include are concatenated with the project's, so include
      // lives only in the projects.
      projects: [
        {
          test: {
            name: 'server',
            environment: 'node',
            include: serverTests,
            // The files share one database and each empties it first.
            fileParallelism: false,
            setupFiles: ['./src/test/setup-server.ts'],
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
          },
        },
      ],
    },
  }
})
