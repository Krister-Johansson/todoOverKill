import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite re-evaluates this file when it restarts the dev server after a .env
// edit, but process.env lives on. Keep the keys that came from .env on
// globalThis so each load can drop them before reading .env again.
const envState = globalThis as typeof globalThis & {
  __todoOverKillEnvKeys?: Set<string>
}

function loadDotEnv(mode: string) {
  const previous = envState.__todoOverKillEnvKeys ?? new Set<string>()
  for (const key of previous) delete process.env[key]

  // loadEnv gives keys already in process.env precedence, so variables set in
  // the shell win over .env.
  const shellKeys = new Set(Object.keys(process.env))
  const loaded = loadEnv(mode, import.meta.dirname, '')
  const fromFile = Object.keys(loaded).filter((key) => !shellKeys.has(key))
  for (const key of fromFile) process.env[key] = loaded[key]
  envState.__todoOverKillEnvKeys = new Set(fromFile)
}

const config = defineConfig(async ({ command, mode }) => {
  loadDotEnv(mode)

  // Validate the environment when the dev or preview server boots, so a
  // missing variable stops startup. `vite build` does not need a .env.
  if (command === 'serve') {
    try {
      await import('./src/env.ts')
    } catch (error) {
      // Print only the list of invalid variables. Any other failure, such as a
      // syntax error in env.ts, keeps its stack trace.
      if (error instanceof Error && error.name === 'InvalidEnvironmentError') {
        console.error(error.message)
        process.exit(1)
      }
      throw error
    }
  }

  return {
    resolve: { tsconfigPaths: true },
    plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  }
})

export default config
