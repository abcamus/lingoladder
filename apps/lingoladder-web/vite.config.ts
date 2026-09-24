import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const src = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
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
