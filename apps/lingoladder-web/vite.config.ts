import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const src = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // The dashboard ships INSIDE the @deepseek-ai/dsh-lingoladder bundle: a
    // profile-installed bundle must carry its own UI, so the build lands in the
    // bundle package rather than this app's own dist.
    outDir: '../../packages/lingoladder/web',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // Explicit HTML input: the third-party notices generator enumerates
      // browser shells through each app's resolved HTML build entries.
      input: { index: src('./index.html') },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
