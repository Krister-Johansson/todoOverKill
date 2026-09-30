import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
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
 * Loads .env into process.env and, for the dev and preview servers, validates
 * it with the schema in src/env.ts.
 *
 * TanStack Start's `tanstack-start-core:load-env` plugin also copies .env into
 * process.env in configResolved, with the same mode and root. That copy is
 * harmless: this plugin is listed first, so its synchronous loadDotEnv call
 * runs before Start's hook, which then writes the same values again. Start's
 * copy never removes keys, which is why this plugin exists: loadDotEnv drops
 * keys deleted from .env when Vite restarts the dev server.
 */
function environment(): Plugin {
  return {
    name: 'todo-over-kill:environment',
    enforce: 'pre',
    async configResolved(config) {
      loadDotEnv(config.mode, config.root)

      // `vite build` does not evaluate the schema and needs no .env.
      if (config.command !== 'serve') return

      try {
        await import('./src/env.ts')
        bootState.__todoOverKillBooted = true
      } catch (error) {
        // Anything other than the list of invalid variables, such as a syntax
        // error in env.ts, keeps its stack trace.
        if (!(error instanceof Error)) throw error
        if (error.name !== 'InvalidEnvironmentError') throw error
        // On a restart after a .env edit, throw a plain error: Vite prints its
        // message, logs "server restart failed", and keeps the old server up.
        if (bootState.__todoOverKillBooted) throw new Error(error.message)
        // On first boot, print only the list and stop.
        console.error(error.message)
        process.exit(1)
      }
    },
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    environment(),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
