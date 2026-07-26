import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app is served from the root of quotes.sherman.industries, so `base` stays
// at its default '/'. An app served from a subpath would have to set it, or the
// asset tags Vite writes into index.html resolve against the wrong prefix and the
// page 404s on its own JS.
//
// Quote data lives in public/quotes.json. Vite serves public/ at the site root
// during `npm run dev` and copies it verbatim into dist/ on build, so the same
// fetch('/quotes.json') works in both without a dev-server shim.
//
// The consequence worth knowing: quotes.json reaches the bucket via the build,
// not independently of it. Editing a quote requires a rebuild -- but CI rebuilds
// on every push anyway, so in practice adding a quote is still "edit one JSON
// file and push."
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
