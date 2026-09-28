import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4327,
    strictPort: true,
  },
  build: {
    // three.js + React Three Fiber form one ~1 MB chunk (~280 kB gzip). It is
    // only loaded lazily with the 3D views, never on first paint.
    chunkSizeWarningLimit: 1100,
  },
})
