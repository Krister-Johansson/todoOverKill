import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { loadDotEnv } from './src/lib/load-dot-env.ts'

// Set once the dev or preview server has booted with a valid environment. Kept
// on globalThis because Vite re-evaluates this file on every restart.
const bootState = globalThis as typeof globalThis & {
  __todoOverKillBooted?: boolean
}

/**
 * Imports the schema in src/env.ts. On first boot an invalid environment
 * prints the list of variables and exits. On a restart after a .env edit,
 * process.env is put back to its previous values and the error is rethrown:
 * Vite logs "server restart failed" and the old server keeps running with the
 * environment it was started with.
 */
async function validateEnvironment(restore: () => void) {
  try {
    await import('./src/env.ts')
    bootState.__todoOverKillBooted = true
  } catch (error) {
    restore()
    // Anything other than the list of invalid variables, such as a syntax
    // error in env.ts, keeps its stack trace.
    if (!(error instanceof Error)) throw error
    if (error.name !== 'InvalidEnvironmentError') throw error
    if (bootState.__todoOverKillBooted) throw new Error(error.message)
    console.error(error.message)
    process.exit(1)
  }
}

export default defineConfig(async ({ command, mode }) => {
  // The config function runs before any plugin hook, so this is always the
  // first write of .env into process.env. TanStack Start's load-env plugin
  // copies .env again in configResolved, but by then every key is already set
  // to the value it would write, so its copy changes nothing. Only this loader
  // removes keys that were deleted from .env since the last restart.
  const restore = loadDotEnv(mode, process.cwd())

  // `vite build` does not evaluate the schema and needs no .env.
  if (command === 'serve') await validateEnvironment(restore)

  return {
    resolve: { tsconfigPaths: true },
    plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  }
})
