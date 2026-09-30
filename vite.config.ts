import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig(async ({ command, mode }) => {
  // Load .env into process.env for server code. Variables already set in the
  // shell win, because loadEnv gives existing process.env keys precedence.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  // Validate the environment when the dev or preview server boots, so a
  // missing variable stops startup. `vite build` does not need a .env.
  if (command === 'serve') {
    try {
      await import('./src/env.ts')
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }
  }

  return {
    resolve: { tsconfigPaths: true },
    plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  }
})

export default config
