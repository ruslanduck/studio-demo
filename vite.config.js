import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Repo name — served at https://ruslanduck.github.io/studio-demo/
  base: '/studio-demo/',
  // Honor a PORT assigned by the environment (lets the preview harness run the
  // dev server on its own port when 5173 is taken, e.g. in a git worktree).
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
})
