import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ffmpeg.wasm needs SharedArrayBuffer, which requires cross-origin isolation.
// These headers enable it in dev and preview. For production hosting, the same
// two headers must be set by your host (Netlify/Vercel/nginx/etc.).
const crossOriginIsolation = {
  name: 'cross-origin-isolation',
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      next()
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      next()
    })
  },
}

export default defineConfig({
  // Relative base so the built site works from any subpath (e.g. GitHub Pages
  // project sites served at username.github.io/repo/).
  base: './',
  plugins: [react(), crossOriginIsolation],
  optimizeDeps: {
    // Let these be served as-is; they ship their own worker/wasm.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
